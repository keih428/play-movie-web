"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MEMBER_POSITIONS, toTrainingGroup, type MemberPosition, type TrainingGroup } from "@/lib/domain/portal";
import {
  FRONT_SPOTS,
  SERVE_LEVEL_LABELS,
  SPIKE_MODES,
  SPIKE_MODE_LABELS,
  SPIKE_SPOT_LABELS,
  SPIKE_TEAM_LABELS,
  formatSpikeRate,
  frontSpotOf,
  hasServeLevel,
  meetsPromotion,
  nextLevel,
  spikeRounds,
  spotFor,
  splitSpikeTeams,
  type LevelStatus,
  type ServeLevel,
  type SpikeCount,
  type SpikeLevel,
  type SpikeMode,
  type SpikeSpot,
  type SpikeTeam,
} from "@/lib/domain/spike-stats";
import { buildTeamApiPath, buildTeamStatsPath } from "@/lib/domain/team";

type CounterPlayer = {
  id: string;
  displayName: string;
  position: MemberPosition | null;
  // 名簿の枠(A・B・C)。AB/C で選ぶのに使う。
  slot: string | null;
};

type SpikeCounterProps = {
  teamSlug: string;
  drillId: string;
  players: CounterPlayer[];
  initialCounts: SpikeCount[];
  // これまでの練習でのサーブのレベル(部員ごと。練習がなければ null)。
  levelStatus: Record<string, LevelStatus | null>;
  canRecord: boolean;
};

// このメニューの組み方(端末ごとに覚える)。
type Setup = {
  // 打つ人と、その人の攻撃チーム。入っていない人は出ない。
  teams: Record<string, SpikeTeam>;
  // トスを上げるセッター(順番どおり)。
  setters: string[];
  // サーブのレベルを変えた人(なければ、これまでの練習から決める)。
  levels: Record<string, ServeLevel>;
};

type Tap = {
  memberId: string;
  setterId: string;
  spot: SpikeSpot;
  level: SpikeLevel;
  kill: boolean;
  delta: 1 | -1;
};

type Cell = { kills: number; attempts: number };

const keyOf = (memberId: string, setterId: string, spot: SpikeSpot, level: SpikeLevel) =>
  `${memberId}|${setterId}|${spot}|${level}`;
const setupKey = (drillId: string) => `spike-setup:${drillId}`;
const EMPTY: Cell = { kills: 0, attempts: 0 };

/**
 * スパイク練習の集計の画面(2026-11-06 から。主将の完成イメージをもとに、スクロールなしで押せるようにした)。
 * - 最初に「人を選ぶ」で、打つ人を前半・後半の攻撃チームに分け、セッターを選ぶ(AB/C で一度に選べる。端末に覚える)
 * - 上で種目(前衛・パイプ…)・攻撃チーム・いまトスを上げているセッターを選ぶ。1人1行で「決定」「ミス」の2つのボタンだけ
 *   (前衛の位置は名簿のポジションから。OH・OP はサーブのレベルを行の中で切り替える)
 * - 下に固定した帯に、チーム戦(決定率)とセッター戦(決定本数)を出す。ペナルティは前衛だけ
 */
export function SpikeCounter({ teamSlug, drillId, players, initialCounts, levelStatus, canRecord }: SpikeCounterProps) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      initialCounts.map((entry) => [
        keyOf(entry.memberId, entry.setterId, entry.spot, entry.level),
        { kills: entry.kills, attempts: entry.attempts },
      ]),
    ),
  );
  const hitters = players.filter((player) => frontSpotOf(player.position) !== null);
  const setterCandidates = players.filter((player) => player.position === "S");
  const [setup, setSetup] = useState<Setup>(() => defaultSetup(hitters, setterCandidates, initialCounts));
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<SpikeMode>("front");
  const [team, setTeam] = useState<SpikeTeam>("first");
  const [setterId, setSetterId] = useState<string | null>(null);
  const [history, setHistory] = useState<Tap[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 前に組んだものを読み出す。なければ、数える人には最初に「人を選ぶ」を開く。
  useEffect(() => {
    let saved: Setup | null = null;
    try {
      saved = parseSetup(JSON.parse(window.localStorage.getItem(setupKey(drillId)) ?? "null"));
    } catch {
      // 端末に保存できない設定なら、毎回組む。
    }
    if (saved) {
      setSetup(saved);
    } else if (canRecord) {
      setPicking(true);
    }
  }, [drillId, canRecord]);

  function saveSetup(next: Setup) {
    setSetup(next);
    try {
      window.localStorage.setItem(setupKey(drillId), JSON.stringify(next));
    } catch {
      // 保存できなくても、この画面の間は使える。
    }
  }

  const nameOf = (id: string) => players.find((player) => player.id === id)?.displayName ?? "?";
  const setters = setup.setters.filter((id) => players.some((player) => player.id === id));
  const { rounds, rotation } = spikeRounds(setters.length);
  const currentSetter = setterId && setters.includes(setterId) ? setterId : (setters[0] ?? null);

  const levelOf = (memberId: string): ServeLevel => {
    const chosen = setup.levels[memberId];
    if (chosen) {
      return chosen;
    }
    const status = levelStatus[memberId];
    return status ? nextLevel(status.level, status.streak) : 1;
  };
  const spotOf = (player: CounterPlayer) => spotFor(mode, frontSpotOf(player.position));
  const levelAt = (player: CounterPlayer, spot: SpikeSpot): SpikeLevel => (hasServeLevel(spot) ? levelOf(player.id) : 0);

  // 合計(条件に合う枠を足す)。
  const sumWhere = (match: (memberId: string, setter: string, spot: SpikeSpot, level: number) => boolean): Cell => {
    let kills = 0;
    let attempts = 0;
    for (const [key, cell] of Object.entries(counts)) {
      const [memberId, setter, spot, level] = key.split("|");
      if (match(memberId, setter, spot as SpikeSpot, Number(level))) {
        kills += cell.kills;
        attempts += cell.attempts;
      }
    }
    return { kills, attempts };
  };
  const modeSpots = (spot: SpikeSpot) =>
    mode === "front" ? (FRONT_SPOTS as readonly SpikeSpot[]).includes(spot) : spot === mode;

  const shown = hitters.filter((player) => setup.teams[player.id] === team && spotOf(player) !== null);
  const teamSize = (entry: SpikeTeam) => hitters.filter((player) => setup.teams[player.id] === entry).length;

  // 周:このチームの打つ人のうち、この種目でいちばん少ない人の打数 + 1。
  const done = shown.length
    ? Math.min(...shown.map((player) => sumWhere((m, _s, spot) => m === player.id && modeSpots(spot)).attempts))
    : 0;
  const turnSetter = setters.length ? setters[Math.floor(done / rotation) % setters.length] : null;

  async function send(tap: Tap) {
    const key = keyOf(tap.memberId, tap.setterId, tap.spot, tap.level);
    const apply = (cell: Cell, sign: 1 | -1): Cell => {
      const attempts = Math.max(cell.attempts + tap.delta * sign, 0);
      return { attempts, kills: Math.min(Math.max(cell.kills + (tap.kill ? tap.delta * sign : 0), 0), attempts) };
    };
    setCounts((previous) => ({ ...previous, [key]: apply(previous[key] ?? EMPTY, 1) }));
    try {
      const response = await fetch(buildTeamApiPath(`/api/portal/drill-stats/${drillId}/spike`, teamSlug), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tap),
      });
      const payload = (await response.json().catch(() => null)) as
        | { kills?: number; attempts?: number; error?: string }
        | null;
      if (!response.ok || typeof payload?.kills !== "number" || typeof payload.attempts !== "number") {
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      const saved = { kills: payload.kills, attempts: payload.attempts };
      setCounts((previous) => ({ ...previous, [key]: saved }));
      setError("");
    } catch (caught) {
      // 保存できなかった分は、画面の数を戻す。
      setCounts((previous) => ({ ...previous, [key]: apply(previous[key] ?? EMPTY, -1) }));
      setError(caught instanceof Error ? caught.message : "保存できませんでした。電波を確かめてください。");
    }
  }

  function feedback(key: string) {
    setFlash(key);
    if (flashTimer.current) {
      clearTimeout(flashTimer.current);
    }
    flashTimer.current = setTimeout(() => setFlash(null), 220);
    try {
      navigator.vibrate?.(12);
    } catch {
      // 震わせられない端末(iPhone など)では、光るだけ。
    }
  }

  function press(player: CounterPlayer, kill: boolean) {
    const spot = spotOf(player);
    if (!spot || !currentSetter) {
      return;
    }
    const tap: Tap = {
      memberId: player.id,
      setterId: currentSetter,
      spot,
      level: levelAt(player, spot),
      kill,
      delta: 1,
    };
    feedback(`${player.id}|${kill ? "kill" : "miss"}`);
    setHistory((previous) => [...previous, tap]);
    void send(tap);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) {
      return;
    }
    setHistory((previous) => previous.slice(0, -1));
    feedback(`${last.memberId}|${last.kill ? "kill" : "miss"}`);
    void send({ ...last, delta: -1 });
  }

  function cycleLevel(memberId: string) {
    const level = levelOf(memberId);
    saveSetup({ ...setup, levels: { ...setup.levels, [memberId]: level === 3 ? 1 : ((level + 1) as ServeLevel) } });
  }

  async function removeDrill() {
    if (!window.confirm("このメニューと、数えた本数をすべて消します。元に戻せません。")) {
      return;
    }
    setDeleting(true);
    const response = await fetch(buildTeamApiPath(`/api/portal/drill-stats/${drillId}`, teamSlug), {
      method: "DELETE",
    });
    if (response.ok) {
      router.push(buildTeamStatsPath(teamSlug));
      router.refresh();
    } else {
      setDeleting(false);
      setError("消せませんでした。");
    }
  }

  // ---- 人を選ぶ ----
  function chooseGroup(group: TrainingGroup | "all") {
    const inGroup = (player: CounterPlayer) => group === "all" || toTrainingGroup(player.slot) === group;
    saveSetup({
      teams: splitSpikeTeams(hitters.filter(inGroup)),
      setters: setterCandidates.filter(inGroup).map((player) => player.id),
      levels: setup.levels,
    });
  }
  function resplit() {
    saveSetup({ ...setup, teams: splitSpikeTeams(hitters.filter((player) => setup.teams[player.id])) });
  }
  // 前半 → 後半 → 出ない → 前半 …
  function cycleTeam(id: string) {
    const teams = { ...setup.teams };
    const now = teams[id];
    if (now === "first") {
      teams[id] = "second";
    } else if (now === "second") {
      delete teams[id];
    } else {
      teams[id] = "first";
    }
    saveSetup({ ...setup, teams });
  }
  function toggleSetter(id: string) {
    saveSetup({
      ...setup,
      setters: setup.setters.includes(id) ? setup.setters.filter((entry) => entry !== id) : [...setup.setters, id],
    });
  }

  // ---- 下の帯:チーム戦・セッター戦 ----
  const teamCell = (entry: SpikeTeam) =>
    sumWhere((m, _s, spot) => setup.teams[m] === entry && modeSpots(spot));
  // セッター戦は、この種目でトスを上げた人だけで比べる。
  const setterKills = setters
    .map((id) => ({ id, ...sumWhere((_m, s, spot) => s === id && modeSpots(spot)) }))
    .filter((entry) => entry.attempts > 0);
  const first = teamCell("first");
  const second = teamCell("second");
  const rateOf = (cell: Cell) => (cell.attempts ? cell.kills / cell.attempts : null);
  // ペナルティは前衛だけ(二段トス・バックアタックはなし)。
  const penalty = mode === "front";
  const teamLoser =
    penalty &&
    first.attempts && second.attempts && rateOf(first) !== rateOf(second)
      ? rateOf(first)! < rateOf(second)!
        ? "first"
        : "second"
      : null;
  const minKills = Math.min(...setterKills.map((entry) => entry.kills));
  const setterLosers =
    penalty && setterKills.length > 1 && setterKills.some((entry) => entry.kills !== minKills)
      ? setterKills.filter((entry) => entry.kills === minKills).map((entry) => entry.id)
      : [];
  const lastTap = history[history.length - 1];

  return (
    <div className={canRecord ? "tp-counter tp-spike tp-counter-recording" : "tp-counter tp-spike"}>
      <div className="tp-counter-top">
        <div className="tp-counter-filters">
          <div className="tp-counter-positions" role="group" aria-label="種目">
            {SPIKE_MODES.map((entry) => (
              <button key={entry} type="button" aria-pressed={entry === mode} onClick={() => setMode(entry)}>
                {SPIKE_MODE_LABELS[entry]}
              </button>
            ))}
          </div>
          {canRecord ? (
            <button type="button" className="tp-spike-edit" onClick={() => setPicking(true)}>
              ✎ 人
            </button>
          ) : null}
        </div>
        <div className="tp-seg tp-spike-teams" role="group" aria-label="攻撃チーム">
          {(["first", "second"] as const).map((entry) => (
            <button key={entry} type="button" aria-pressed={entry === team} onClick={() => setTeam(entry)}>
              {SPIKE_TEAM_LABELS[entry]}攻撃 <small>{teamSize(entry)}人</small>
            </button>
          ))}
        </div>
        <div className="tp-spike-setters" role="group" aria-label="トスを上げているセッター">
          <span className="tp-spike-label">トス</span>
          {setters.map((id) => (
            <button key={id} type="button" aria-pressed={id === currentSetter} onClick={() => setSetterId(id)}>
              {nameOf(id)}
              {id === turnSetter && setters.length > 1 ? <small>の番</small> : null}
            </button>
          ))}
          {setters.length === 0 ? <span className="tp-small tp-muted">「✎ 人」でセッターを選んでください</span> : null}
        </div>
        <p className="tp-spike-round" aria-live="polite">
          {shown.length ? (
            <>
              <b>{Math.min(done + 1, rounds)}</b>周目 / {rounds}周
              {setters.length > 1 && done < rounds ? (
                <span className="tp-muted"> ・ {rotation}周ごとにセッター交代(あと{rotation - (done % rotation)}周)</span>
              ) : null}
            </>
          ) : null}
        </p>
      </div>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tp-spike-list">
        {shown.map((player) => {
          const spot = spotOf(player)!;
          const level = levelAt(player, spot);
          const mine = sumWhere((m, _s, s) => m === player.id && s === spot);
          const status = levelStatus[player.id];
          const atLevel = sumWhere((m, _s, s, l) => m === player.id && hasServeLevel(s) && l === level);
          const priorStreak = status && status.level === level ? status.streak : 0;
          const promote =
            level !== 0 && level < 3 && meetsPromotion(atLevel.kills, atLevel.attempts, rounds) && priorStreak + 1 >= 2;
          return (
            <div key={player.id} className="tp-spike-row">
              <span className="tp-counter-name">
                <b>{player.displayName}</b>
                <small>
                  {mode === "front" ? SPIKE_SPOT_LABELS[spot].replace("前衛", "") : player.position}
                  {level ? (
                    <button
                      type="button"
                      className={promote ? "tp-spike-level tp-spike-promote" : "tp-spike-level"}
                      disabled={!canRecord}
                      title={SERVE_LEVEL_LABELS[level]}
                      aria-label={`サーブ Lv${level} ${SERVE_LEVEL_LABELS[level]}(押すと変える)`}
                      onClick={() => cycleLevel(player.id)}
                    >
                      Lv{level}
                      {promote ? "↑" : ""}
                    </button>
                  ) : null}
                </small>
              </span>
              <button
                type="button"
                className={[
                  "tp-spike-kill",
                  flash === `${player.id}|kill` ? "tp-counter-flash" : "",
                ].join(" ")}
                disabled={!canRecord || !currentSetter}
                aria-label={`${player.displayName} 決定`}
                onClick={() => press(player, true)}
              >
                決定
              </button>
              <button
                type="button"
                className={["tp-spike-miss", flash === `${player.id}|miss` ? "tp-counter-flash" : ""].join(" ")}
                disabled={!canRecord || !currentSetter}
                aria-label={`${player.displayName} ミス`}
                onClick={() => press(player, false)}
              >
                ミス
              </button>
              <span className="tp-spike-score">
                <b>
                  {mine.kills}/{mine.attempts}
                </b>
                <small>{formatSpikeRate(mine.kills, mine.attempts)}</small>
              </span>
            </div>
          );
        })}
        {shown.length === 0 ? (
          <p className="tp-muted">
            {SPIKE_TEAM_LABELS[team]}攻撃チームに、この種目で打つ人がいません。
            {canRecord ? "「✎ 人」から選んでください。" : ""}
          </p>
        ) : null}
      </div>

      {canRecord ? (
        <div className="tp-actions tp-gap">
          <button type="button" className="tp-button tp-ghost" disabled={deleting} onClick={() => void removeDrill()}>
            {deleting ? "消しています…" : "このメニューを消す"}
          </button>
        </div>
      ) : null}

      {/* 下に固定する帯:勝負の途中経過と「戻す」 */}
      <div className="tp-counter-dock tp-spike-dock">
        {canRecord ? (
          <button type="button" className="tp-counter-undo" disabled={!lastTap} onClick={undo}>
            ↶ 戻す
          </button>
        ) : null}
        <div className="tp-spike-battle" aria-live="polite">
          <div>
            {(["first", "second"] as const).map((entry) => {
              const cell = entry === "first" ? first : second;
              return (
                <span key={entry} className={teamLoser === entry ? "tp-spike-lose" : undefined}>
                  {SPIKE_TEAM_LABELS[entry]} {cell.kills}/{cell.attempts}{" "}
                  <small>{formatSpikeRate(cell.kills, cell.attempts)}</small>
                </span>
              );
            })}
          </div>
          <div>
            {setterKills.map((entry) => (
              <span key={entry.id} className={setterLosers.includes(entry.id) ? "tp-spike-lose" : undefined}>
                {nameOf(entry.id)} {entry.kills}本
              </span>
            ))}
          </div>
          <small className="tp-muted">
            {mode === "front"
              ? lastTap
                ? `${nameOf(lastTap.memberId)} ${lastTap.kill ? "決定" : "ミス"}(トス ${nameOf(lastTap.setterId)})`
                : "赤がいまのペナルティ(チームは決定率、セッターは決定本数)"
              : "二段トス・バックアタックはペナルティなし"}
          </small>
        </div>
      </div>

      {picking ? (
        <button type="button" className="tp-counter-backdrop" aria-label="閉じる" onClick={() => setPicking(false)} />
      ) : null}
      {picking ? (
        <div className="tp-card tp-counter-picker" role="dialog" aria-label="打つ人とセッター">
          <div className="tp-counter-picker-head">
            <b>打つ人とセッターを選ぶ</b>
            <span className="tp-counter-positions" role="group" aria-label="まとめて選ぶ">
              {(["AB", "C", "all"] as const).map((entry) => (
                <button key={entry} type="button" onClick={() => chooseGroup(entry)}>
                  {entry === "all" ? "全員" : entry} で組む
                </button>
              ))}
              <button type="button" onClick={resplit}>
                前半・後半を分け直す
              </button>
            </span>
            <p className="tp-small tp-muted">押すたびに 前半 → 後半 → 出ない と変わります。前半・後半はポジションが偏らないように分けます。</p>
          </div>
          {[
            ...(["first", "second"] as const).map((entry) => ({
              title: `${SPIKE_TEAM_LABELS[entry]}攻撃チーム`,
              entries: hitters.filter((player) => setup.teams[player.id] === entry),
            })),
            { title: "出ない人", entries: hitters.filter((player) => !setup.teams[player.id]) },
          ].map((section) => (
            <div key={section.title} className="tp-counter-picker-section">
              <p className="tp-small tp-muted">
                {section.title}・{section.entries.length}人
              </p>
              <div className="tp-counter-picker-list">
                {sortByPosition(section.entries).map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className="tp-counter-pick"
                    aria-pressed={Boolean(setup.teams[player.id])}
                    onClick={() => cycleTeam(player.id)}
                  >
                    <b>{player.displayName}</b>
                    <small>
                      {player.position} ・ {player.slot ?? "枠なし"}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="tp-counter-picker-section">
            <p className="tp-small tp-muted">セッター(押すと入る・外す)・{setters.length}人</p>
            <div className="tp-counter-picker-list">
              {setterCandidates.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="tp-counter-pick"
                  aria-pressed={setup.setters.includes(player.id)}
                  onClick={() => toggleSetter(player.id)}
                >
                  <b>{player.displayName}</b>
                  <small>S ・ {player.slot ?? "枠なし"}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="tp-actions">
            <button type="button" className="tp-button" onClick={() => setPicking(false)}>
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sortByPosition(players: CounterPlayer[]): CounterPlayer[] {
  const order = (player: CounterPlayer) =>
    player.position ? MEMBER_POSITIONS.indexOf(player.position) : MEMBER_POSITIONS.length;
  return [...players].sort((a, b) => order(a) - order(b));
}

/** 端末に覚えたものがないとき:数えた人がいればその人たちを、いなければ打つ人全員を、前半・後半に分ける。 */
function defaultSetup(hitters: CounterPlayer[], setters: CounterPlayer[], counts: SpikeCount[]): Setup {
  const counted = new Set(counts.map((entry) => entry.memberId));
  const usedSetters = [...new Set(counts.map((entry) => entry.setterId))];
  return {
    teams: splitSpikeTeams(counted.size ? hitters.filter((player) => counted.has(player.id)) : hitters),
    setters: usedSetters.length ? usedSetters : setters.map((player) => player.id),
    levels: {},
  };
}

function parseSetup(value: unknown): Setup | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Partial<Setup>;
  const teams: Record<string, SpikeTeam> = {};
  for (const [id, team] of Object.entries(raw.teams ?? {})) {
    if (team === "first" || team === "second") {
      teams[id] = team;
    }
  }
  const levels: Record<string, ServeLevel> = {};
  for (const [id, level] of Object.entries(raw.levels ?? {})) {
    if (level === 1 || level === 2 || level === 3) {
      levels[id] = level;
    }
  }
  const setters = Array.isArray(raw.setters) ? raw.setters.filter((id): id is string => typeof id === "string") : [];
  return { teams, setters, levels };
}
