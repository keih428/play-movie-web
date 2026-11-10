"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HalfTeamColumns } from "@/components/half-team-columns";
import { SpikeDrillResult } from "@/components/spike-drill-result";
import { MEMBER_POSITIONS, toTrainingGroup, type MemberPosition, type TrainingGroup } from "@/lib/domain/portal";
import {
  FRONT_SPOTS,
  SERVE_LEVEL_LABELS,
  SPIKE_MAX_SHOWN_SETTERS,
  SPIKE_MODES,
  SPIKE_MODE_LABELS,
  SPIKE_SPOT_LABELS,
  SPIKE_TEAM_LABELS,
  formatSpikeRate,
  frontSpotOf,
  hasServeLevel,
  parseSpikeSetup,
  spotFor,
  splitSpikeTeams,
  toggleShownSetter,
  type ServeLevel,
  type SpikeCount,
  type SpikeLevel,
  type SpikeMode,
  type SpikeSetup,
  type SpikeSpot,
  type SpikeTeam,
} from "@/lib/domain/spike-stats";
import { buildTeamApiPath } from "@/lib/domain/team";

type CounterPlayer = {
  id: string;
  displayName: string;
  position: MemberPosition | null;
  // 名簿の枠(A・B・C)。AB/C で選ぶのに使う。
  slot: string | null;
  // 受けるサーブのレベル(名簿で決める。OH・OP だけ使う)。
  serveLevel: ServeLevel;
};

type SpikeCounterProps = {
  teamSlug: string;
  drillId: string;
  players: CounterPlayer[];
  initialCounts: SpikeCount[];
  // メニューの組み方(共有)。まだ組んでいなければ null。
  initialSetup: SpikeSetup | null;
  initialSetupSavedAt: string | null;
  canRecord: boolean;
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

// 何ミリ秒ごとに、ほかの人が数えた分を取りにいくか。
const POLL_MS = 2000;

const keyOf = (memberId: string, setterId: string, spot: SpikeSpot, level: SpikeLevel) =>
  `${memberId}|${setterId}|${spot}|${level}`;
// この端末で画面に出すもの(チーム・セッター)を覚える。組み方そのものは共有。
const viewKey = (drillId: string) => `spike-view:${drillId}`;
const EMPTY: Cell = { kills: 0, attempts: 0 };

/** 画面で持っている数を、表に渡す形(SpikeCount)に戻す。 */
const toCounts = (cells: Record<string, Cell>): SpikeCount[] =>
  Object.entries(cells)
    .filter(([, cell]) => cell.attempts > 0)
    .map(([key, cell]) => {
      const [memberId, setterId, spot, level] = key.split("|");
      return { memberId, setterId, spot: spot as SpikeSpot, level: Number(level) as SpikeLevel, ...cell };
    });

const toCells = (counts: SpikeCount[]): Record<string, Cell> =>
  Object.fromEntries(
    counts.map((entry) => [
      keyOf(entry.memberId, entry.setterId, entry.spot, entry.level),
      { kills: entry.kills, attempts: entry.attempts },
    ]),
  );

/**
 * スパイク練習の集計の画面(2026-11-06 から。主将の完成イメージをもとに、スクロールなしで押せるようにした)。
 * - 最初に「人を選ぶ」で、打つ人を前半・後半の攻撃チームに分け、セッターを選ぶ(AB/C で一度に選べる)。組み方はメニューごとに共有する
 * - 上で種目・攻撃チームと、画面に並べるセッター(最大3人。同時に何人かが上げるため)を選ぶ。
 *   1人1行で、セッターごとに「決定」「ミス」の2つのボタン(押した数がボタンに出る)
 * - マネージャーが何人かで分担して同時に数えられるよう、2秒ごとにほかの人が数えた分と組み方を取りにいく
 *   (自分が送っている途中の分があるときは、取ってきたものを使わない。数がずれて見えないように)
 * - 上の「入力|結果」で、このメニューの結果の表(チーム戦・スパイカー・セッター)に切り替えられる(2026-11-10 から)
 * - 下に固定した帯に、チーム戦(決定率)とセッター戦(決定本数)を出す。ペナルティ(赤)は、選んでいる種目の中で比べる
 *   (2026-11-06 は前衛だけ。2026-11-10 からパイプ・シャー・二段も。主将の依頼)
 */
export function SpikeCounter({
  teamSlug,
  drillId,
  players,
  initialCounts,
  initialSetup,
  initialSetupSavedAt,
  canRecord,
}: SpikeCounterProps) {
  const apiPath = buildTeamApiPath(`/api/portal/drill-stats/${drillId}/spike`, teamSlug);
  const hitters = players.filter((player) => frontSpotOf(player.position) !== null);
  const setterCandidates = players.filter((player) => player.position === "S");

  const [counts, setCounts] = useState<Record<string, Cell>>(() => toCells(initialCounts));
  const [setup, setSetup] = useState<SpikeSetup>(
    () => initialSetup ?? defaultSetup(hitters, setterCandidates, initialCounts),
  );
  const setupSavedAt = useRef(initialSetupSavedAt);
  const [picking, setPicking] = useState(false);
  // 「入力」(ボタンで数える)か「結果」(このメニューの表)か。数えない人(部員)は結果から(2026-11-10 から)。
  const [view, setView] = useState<"input" | "result">(canRecord ? "input" : "result");
  const [mode, setMode] = useState<SpikeMode>("front");
  const [team, setTeam] = useState<SpikeTeam>("first");
  // 画面に並べるセッター(null は「組み方の最初の3人」)。
  const [shownChoice, setShownChoice] = useState<string[] | null>(null);
  const [history, setHistory] = useState<Tap[]>([]);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 送っている途中の本数(枠ごと)と、送った・返事が来たたびに増やす番号。取ってきた数を使ってよいかの判断に使う。
  const pending = useRef(new Map<string, Cell>());
  const mutations = useRef(0);
  const savingSetup = useRef(0);

  // この端末で出していたチーム・セッターを読み出す。組んでいなければ、数える人には最初に「人を選ぶ」を開く。
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(viewKey(drillId)) ?? "null") as {
        team?: unknown;
        setters?: unknown;
      } | null;
      if (saved?.team === "first" || saved?.team === "second") {
        setTeam(saved.team);
      }
      if (Array.isArray(saved?.setters)) {
        setShownChoice(saved.setters.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      // 端末に保存できない設定なら、毎回えらぶ。
    }
    if (!initialSetup && canRecord) {
      setPicking(true);
    }
  }, [drillId, canRecord, initialSetup]);

  function saveView(next: { team: SpikeTeam; setters: string[] | null }) {
    try {
      window.localStorage.setItem(viewKey(drillId), JSON.stringify(next));
    } catch {
      // 保存できなくても、この画面の間は使える。
    }
  }

  // ---- ほかの人が数えた分を取りにいく ----
  const poll = useCallback(async () => {
    const startedAt = mutations.current;
    try {
      const response = await fetch(apiPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error();
      }
      const payload = (await response.json()) as {
        counts?: SpikeCount[];
        setup?: unknown;
        setupSavedAt?: string | null;
      };
      setOnline(true);
      // 取りにいく間に押した・返事が来た、または送っている途中の分があれば、この結果は古いかもしれないので使わない。
      if (mutations.current === startedAt && pending.current.size === 0 && Array.isArray(payload.counts)) {
        setCounts(toCells(payload.counts));
      }
      const remote = parseSpikeSetup(payload.setup);
      if (remote && savingSetup.current === 0 && payload.setupSavedAt && payload.setupSavedAt !== setupSavedAt.current) {
        setupSavedAt.current = payload.setupSavedAt;
        setSetup(remote);
      }
    } catch {
      setOnline(false);
    }
  }, [apiPath]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        await poll();
      }
      if (!stopped) {
        timer = setTimeout(tick, POLL_MS);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    // 画面に戻ってきたら、すぐ取りにいく。
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  async function saveSetup(next: SpikeSetup) {
    setSetup(next);
    savingSetup.current += 1;
    try {
      const response = await fetch(apiPath, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = (await response.json().catch(() => null)) as { setupSavedAt?: string; error?: string } | null;
      if (!response.ok || !payload?.setupSavedAt) {
        throw new Error(payload?.error ?? "組み方を保存できませんでした。");
      }
      setupSavedAt.current = payload.setupSavedAt;
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "組み方を保存できませんでした。");
    } finally {
      savingSetup.current -= 1;
    }
  }

  const nameOf = (id: string) => players.find((player) => player.id === id)?.displayName ?? "?";
  const setters = setup.setters.filter((id) => players.some((player) => player.id === id));
  const shownSetters = (shownChoice ?? setters).filter((id) => setters.includes(id)).slice(0, SPIKE_MAX_SHOWN_SETTERS);
  const spotOf = (player: CounterPlayer) => spotFor(mode, frontSpotOf(player.position));
  // サーブのレベルは名簿で決める(2026-11-07 から。主将の依頼)。
  const levelAt = (player: CounterPlayer, spot: SpikeSpot): SpikeLevel => (hasServeLevel(spot) ? player.serveLevel : 0);

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

  function addPending(key: string, cell: Cell, sign: 1 | -1) {
    const now = pending.current.get(key) ?? EMPTY;
    const next = { kills: now.kills + cell.kills * sign, attempts: now.attempts + cell.attempts * sign };
    if (next.kills === 0 && next.attempts === 0) {
      pending.current.delete(key);
    } else {
      pending.current.set(key, next);
    }
  }

  async function send(tap: Tap) {
    const key = keyOf(tap.memberId, tap.setterId, tap.spot, tap.level);
    const change: Cell = { kills: tap.kill ? tap.delta : 0, attempts: tap.delta };
    const apply = (cell: Cell, sign: 1 | -1): Cell => {
      const attempts = Math.max(cell.attempts + change.attempts * sign, 0);
      return { attempts, kills: Math.min(Math.max(cell.kills + change.kills * sign, 0), attempts) };
    };
    mutations.current += 1;
    addPending(key, change, 1);
    setCounts((previous) => ({ ...previous, [key]: apply(previous[key] ?? EMPTY, 1) }));
    try {
      const response = await fetch(apiPath, {
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
      addPending(key, change, -1);
      // サーバーの数に、まだ送っている途中の分(同じ枠をすばやく続けて押したとき)を足して出す。
      const rest = pending.current.get(key) ?? EMPTY;
      const saved = { kills: payload.kills + rest.kills, attempts: payload.attempts + rest.attempts };
      setCounts((previous) => ({ ...previous, [key]: saved }));
      setError("");
    } catch (caught) {
      // 保存できなかった分は、画面の数を戻す。
      addPending(key, change, -1);
      setCounts((previous) => ({ ...previous, [key]: apply(previous[key] ?? EMPTY, -1) }));
      setError(caught instanceof Error ? caught.message : "保存できませんでした。電波を確かめてください。");
    } finally {
      mutations.current += 1;
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

  const flashKey = (memberId: string, setterId: string, kill: boolean) =>
    `${memberId}|${setterId}|${kill ? "kill" : "miss"}`;

  function press(player: CounterPlayer, setterId: string, kill: boolean) {
    const spot = spotOf(player);
    if (!spot) {
      return;
    }
    const tap: Tap = { memberId: player.id, setterId, spot, level: levelAt(player, spot), kill, delta: 1 };
    feedback(flashKey(player.id, setterId, kill));
    setHistory((previous) => [...previous, tap]);
    void send(tap);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) {
      return;
    }
    setHistory((previous) => previous.slice(0, -1));
    feedback(flashKey(last.memberId, last.setterId, last.kill));
    void send({ ...last, delta: -1 });
  }

  function chooseTeam(next: SpikeTeam) {
    setTeam(next);
    saveView({ team: next, setters: shownChoice });
  }

  function toggleShown(id: string) {
    const next = toggleShownSetter(shownSetters, id);
    setShownChoice(next);
    saveView({ team, setters: next });
  }

  // ---- 人を選ぶ ----
  function chooseGroup(group: TrainingGroup | "all") {
    const inGroup = (player: CounterPlayer) => group === "all" || toTrainingGroup(player.slot) === group;
    void saveSetup({
      teams: splitSpikeTeams(hitters.filter(inGroup)),
      setters: setterCandidates.filter(inGroup).map((player) => player.id),
    });
  }
  function resplit() {
    void saveSetup({ ...setup, teams: splitSpikeTeams(hitters.filter((player) => setup.teams[player.id])) });
  }
  // 前半・後半・出ないへ移す(2026-11-07 は ↑↓、2026-11-10 から2列の画面で ← → ×)。
  function moveTeam(id: string, next: SpikeTeam | null) {
    const teams = { ...setup.teams };
    if (next) {
      teams[id] = next;
    } else {
      delete teams[id];
    }
    void saveSetup({ ...setup, teams });
  }
  function toggleSetter(id: string) {
    void saveSetup({
      ...setup,
      setters: setup.setters.includes(id) ? setup.setters.filter((entry) => entry !== id) : [...setup.setters, id],
    });
  }
  function closePicker() {
    setPicking(false);
    // まだだれも保存していなければ、いまの組み方(最初に自動で組んだもの)を保存して、ほかの人とそろえる。
    if (!setupSavedAt.current && canRecord) {
      void saveSetup(setup);
    }
  }

  // ---- 下の帯:チーム戦・セッター戦 ----
  const teamCell = (entry: SpikeTeam) => sumWhere((m, _s, spot) => setup.teams[m] === entry && modeSpots(spot));
  // セッター戦は、この種目でトスを上げた人だけで比べる。
  const setterKills = setters
    .map((id) => ({ id, ...sumWhere((_m, s, spot) => s === id && modeSpots(spot)) }))
    .filter((entry) => entry.attempts > 0);
  const first = teamCell("first");
  const second = teamCell("second");
  const rateOf = (cell: Cell) => (cell.attempts ? cell.kills / cell.attempts : null);
  const teamLoser =
    first.attempts && second.attempts && rateOf(first) !== rateOf(second)
      ? rateOf(first)! < rateOf(second)!
        ? "first"
        : "second"
      : null;
  const minKills = Math.min(...setterKills.map((entry) => entry.kills));
  const setterLosers =
    setterKills.length > 1 && setterKills.some((entry) => entry.kills !== minKills)
      ? setterKills.filter((entry) => entry.kills === minKills).map((entry) => entry.id)
      : [];
  const lastTap = history[history.length - 1];
  // 名前の列 + セッターごとに「決定」「ミス」の2列。
  const columns = { gridTemplateColumns: `4.8em repeat(${Math.max(shownSetters.length, 1) * 2}, minmax(0, 1fr))` };

  return (
    <div className={canRecord ? "tp-counter tp-spike tp-counter-recording" : "tp-counter tp-spike"}>
      <div className="tp-counter-top">
        <div className="tp-seg tp-counter-views" role="group" aria-label="入力・結果">
          {(["input", "result"] as const).map((entry) => (
            <button key={entry} type="button" aria-pressed={entry === view} onClick={() => setView(entry)}>
              {entry === "input" ? "入力" : "結果"}
            </button>
          ))}
        </div>
        {view === "input" ? (
          <>
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
                <button key={entry} type="button" aria-pressed={entry === team} onClick={() => chooseTeam(entry)}>
                  {SPIKE_TEAM_LABELS[entry]}攻撃 <small>{teamSize(entry)}人</small>
                </button>
              ))}
            </div>
            <div className="tp-spike-setters" role="group" aria-label={`画面に並べるセッター(${SPIKE_MAX_SHOWN_SETTERS}人まで)`}>
              <span className="tp-spike-label">
                トス
                <br />
                {SPIKE_MAX_SHOWN_SETTERS}人まで
              </span>
              {setters.map((id) => (
                <button key={id} type="button" aria-pressed={shownSetters.includes(id)} onClick={() => toggleShown(id)}>
                  {nameOf(id)}
                </button>
              ))}
              {setters.length === 0 ? <span className="tp-small tp-muted">「✎ 人」でセッターを選んでください</span> : null}
            </div>
          </>
        ) : null}
        <p className="tp-spike-round" aria-live="polite">
          <span className={online ? "tp-spike-sync" : "tp-spike-sync tp-spike-sync-off"}>
            {online ? "● ほかの人の入力も反映中" : "○ つながっていません"}
          </span>
        </p>
      </div>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      {view === "input" ? (
        <>
          {/* セッターの名前の見出し。下の行のボタンと同じ並び。スクロールしても上に残る */}
          {shownSetters.length ? (
            <div className="tp-spike-row tp-spike-legend" style={columns} aria-hidden="true">
              <span className="tp-counter-legend-skill">{SPIKE_MODE_LABELS[mode]}</span>
              {shownSetters.map((id) => (
                <span key={id} className="tp-spike-legend-setter">
                  {nameOf(id)}
                </span>
              ))}
            </div>
          ) : null}

          <div className="tp-spike-list">
            {shown.map((player) => {
              const spot = spotOf(player)!;
              const level = levelAt(player, spot);
              const mine = sumWhere((m, _s, s) => m === player.id && s === spot);
              return (
                <div key={player.id} className="tp-spike-row" style={columns}>
                  <span className="tp-counter-name">
                    <b>{player.displayName}</b>
                    <small>
                      {mode === "front" ? SPIKE_SPOT_LABELS[spot].replace("前衛", "") : player.position}
                      {level ? (
                        <span className="tp-spike-level" title={SERVE_LEVEL_LABELS[level]}>
                          Lv{level}
                        </span>
                      ) : null}
                    </small>
                    <small>
                      {mine.kills}/{mine.attempts} {formatSpikeRate(mine.kills, mine.attempts)}
                    </small>
                  </span>
                  {shownSetters.map((setterId) => {
                    const cell = sumWhere((m, s, sp, l) => m === player.id && s === setterId && sp === spot && l === level);
                    return (["kill", "miss"] as const).map((kind) => {
                      const kill = kind === "kill";
                      const value = kill ? cell.kills : cell.attempts - cell.kills;
                      return (
                        <button
                          key={`${setterId}-${kind}`}
                          type="button"
                          className={[
                            kill ? "tp-spike-kill" : "tp-spike-miss",
                            flash === flashKey(player.id, setterId, kill) ? "tp-counter-flash" : "",
                          ].join(" ")}
                          disabled={!canRecord}
                          aria-label={`${player.displayName} ${kill ? "決定" : "ミス"}(トス ${nameOf(setterId)}):${value}本`}
                          onClick={() => press(player, setterId, kill)}
                        >
                          <b>{value}</b>
                          <small>{kill ? "決定" : "ミス"}</small>
                        </button>
                      );
                    });
                  })}
                </div>
              );
            })}
            {shown.length === 0 ? (
              <p className="tp-muted">
                {SPIKE_TEAM_LABELS[team]}攻撃チームに、この種目で打つ人がいません。
                {canRecord ? "「✎ 人」から選んでください。" : ""}
              </p>
            ) : null}
            {shown.length > 0 && shownSetters.length === 0 ? (
              <p className="tp-muted">上の「トス」で、画面に並べるセッターを選んでください。</p>
            ) : null}
          </div>

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
                {lastTap
                  ? `自分の最後:${nameOf(lastTap.memberId)} ${lastTap.kill ? "決定" : "ミス"}(トス ${nameOf(lastTap.setterId)})`
                  : `赤がいまのペナルティ(${SPIKE_MODE_LABELS[mode]}。チームは決定率、セッターは決定本数)`}
              </small>
            </div>
          </div>
        </>
      ) : (
        <SpikeDrillResult counts={toCounts(counts)} teams={setup.teams} nameOf={nameOf} />
      )}

      {picking ? <button type="button" className="tp-counter-backdrop" aria-label="閉じる" onClick={closePicker} /> : null}
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
            <p className="tp-small tp-muted">
              ← → でもう片方へ、× で出ない人へ移します。前半・後半はポジションが偏らないように分けます。組み方は、このメニューを数えている全員で共有します。
            </p>
          </div>
          <HalfTeamColumns
            players={hitters}
            teams={setup.teams}
            labels={{ first: `${SPIKE_TEAM_LABELS.first}攻撃`, second: `${SPIKE_TEAM_LABELS.second}攻撃` }}
            onMove={moveTeam}
          />
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
            <button type="button" className="tp-button" onClick={closePicker}>
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

/** まだ組んでいないとき:数えた人がいればその人たちを、いなければ打つ人全員を、前半・後半に分ける。 */
function defaultSetup(hitters: CounterPlayer[], setters: CounterPlayer[], counts: SpikeCount[]): SpikeSetup {
  const counted = new Set(counts.map((entry) => entry.memberId));
  const usedSetters = [...new Set(counts.map((entry) => entry.setterId))];
  return {
    teams: splitSpikeTeams(counted.size ? hitters.filter((player) => counted.has(player.id)) : hitters),
    setters: usedSetters.length ? usedSetters : setters.map((player) => player.id),
  };
}
