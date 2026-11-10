"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MEMBER_POSITIONS, toTrainingGroup, type MemberPosition, type TrainingGroup } from "@/lib/domain/portal";
import {
  SERVE_RESULTS,
  SERVE_RESULT_LABELS,
  SERVE_TEAM_LABELS,
  emptyServeTally,
  formatServeEfficiency,
  isServer,
  parseServeSetup,
  serveAttempts,
  splitServeTeams,
  type ServeCount,
  type ServeResult,
  type ServeSetup,
  type ServeTally,
  type ServeTeam,
} from "@/lib/domain/serve-stats";
import { buildTeamApiPath } from "@/lib/domain/team";

type CounterPlayer = {
  id: string;
  displayName: string;
  position: MemberPosition | null;
  // 名簿の枠(A・B・C)。AB/C で組むのに使う。
  slot: string | null;
};

type ServeCounterProps = {
  teamSlug: string;
  drillId: string;
  players: CounterPlayer[];
  initialCounts: ServeCount[];
  // 前半・後半の組み方(共有)。まだ組んでいなければ null。
  initialSetup: ServeSetup | null;
  initialSetupSavedAt: string | null;
  canRecord: boolean;
};

type Tap = { memberId: string; result: ServeResult; delta: 1 | -1 };

// 何ミリ秒ごとに、ほかの人が数えた分を取りにいくか(スパイク・レセプションと同じ)。
const POLL_MS = 2000;

const viewKey = (drillId: string) => `serve-view:${drillId}`;

const toTallies = (counts: ServeCount[]): Record<string, ServeTally> =>
  Object.fromEntries(
    counts.map(({ memberId, ...tally }) => [memberId, { ace: tally.ace, effect: tally.effect, in: tally.in, miss: tally.miss }]),
  );

const addTally = (base: ServeTally, change: ServeTally, sign: 1 | -1): ServeTally => ({
  ace: Math.max(base.ace + change.ace * sign, 0),
  effect: Math.max(base.effect + change.effect * sign, 0),
  in: Math.max(base.in + change.in * sign, 0),
  miss: Math.max(base.miss + change.miss * sign, 0),
});

const BUTTON_CLASS: Record<ServeResult, string> = {
  ace: "tp-spike-kill",
  effect: "tp-spike-kill tp-serve-effect",
  in: "tp-spike-miss",
  miss: "tp-spike-miss tp-serve-miss",
};

/**
 * サーブ効果率の集計の画面(2026-11-10 から。主将の依頼)。1人1行で「エース」「効果」「入った」「ミス」の4つのボタン。
 * - 打つのはリベロ以外のプレイヤー。前半・後半に分かれて打つので、上で前半・後半を切り替える(端末ごとに覚える)
 * - 「✎ 人」で前半・後半・出ないを ↑↓ で移す(スパイクと同じ)。組み方はメニューごとに共有する
 * - マネージャーが何人かで同時に数えられるよう、2秒ごとにほかの人が数えた分と組み方を取りにいく
 */
export function ServeCounter({
  teamSlug,
  drillId,
  players,
  initialCounts,
  initialSetup,
  initialSetupSavedAt,
  canRecord,
}: ServeCounterProps) {
  const apiPath = buildTeamApiPath(`/api/portal/drill-stats/${drillId}/serve`, teamSlug);
  const servers = players.filter((player) => isServer(player.position));
  const [counts, setCounts] = useState<Record<string, ServeTally>>(() => toTallies(initialCounts));
  const [setup, setSetup] = useState<ServeSetup>(() => initialSetup ?? defaultSetup(servers, initialCounts));
  const setupSavedAt = useRef(initialSetupSavedAt);
  const [picking, setPicking] = useState(false);
  const [team, setTeam] = useState<ServeTeam>("first");
  const [history, setHistory] = useState<Tap[]>([]);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 送っている途中の数(人ごと)と、送った・返事が来たたびに増やす番号。取ってきた数を使ってよいかの判断に使う。
  const pending = useRef(new Map<string, ServeTally>());
  const mutations = useRef(0);
  const savingSetup = useRef(0);

  // この端末で出していた前半・後半を読み出す。組んでいなければ、数える人には最初に「人を選ぶ」を開く。
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(viewKey(drillId));
      if (saved === "first" || saved === "second") {
        setTeam(saved);
      }
    } catch {
      // 端末に保存できない設定なら、毎回えらぶ。
    }
    if (!initialSetup && canRecord) {
      setPicking(true);
    }
  }, [drillId, canRecord, initialSetup]);

  function chooseTeam(next: ServeTeam) {
    setTeam(next);
    try {
      window.localStorage.setItem(viewKey(drillId), next);
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
        counts?: ServeCount[];
        setup?: unknown;
        setupSavedAt?: string | null;
      };
      setOnline(true);
      if (mutations.current === startedAt && pending.current.size === 0 && Array.isArray(payload.counts)) {
        setCounts(toTallies(payload.counts));
      }
      const remote = parseServeSetup(payload.setup);
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

  async function saveSetup(next: ServeSetup) {
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
        throw new Error(payload?.error ?? "前半・後半を保存できませんでした。");
      }
      setupSavedAt.current = payload.setupSavedAt;
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "前半・後半を保存できませんでした。");
    } finally {
      savingSetup.current -= 1;
    }
  }

  function addPending(key: string, change: ServeTally, sign: 1 | -1) {
    const now = pending.current.get(key) ?? emptyServeTally();
    const next: ServeTally = {
      ace: now.ace + change.ace * sign,
      effect: now.effect + change.effect * sign,
      in: now.in + change.in * sign,
      miss: now.miss + change.miss * sign,
    };
    if (SERVE_RESULTS.every((result) => next[result] === 0)) {
      pending.current.delete(key);
    } else {
      pending.current.set(key, next);
    }
  }

  async function send(tap: Tap) {
    const key = tap.memberId;
    const change: ServeTally = { ...emptyServeTally(), [tap.result]: tap.delta };
    mutations.current += 1;
    addPending(key, change, 1);
    setCounts((previous) => ({ ...previous, [key]: addTally(previous[key] ?? emptyServeTally(), change, 1) }));
    try {
      const response = await fetch(apiPath, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tap),
      });
      const payload = (await response.json().catch(() => null)) as (Partial<ServeCount> & { error?: string }) | null;
      if (!response.ok || !payload || SERVE_RESULTS.some((result) => typeof payload[result] !== "number")) {
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      addPending(key, change, -1);
      const rest = pending.current.get(key) ?? emptyServeTally();
      const saved = addTally(payload as ServeTally, rest, 1);
      setCounts((previous) => ({ ...previous, [key]: saved }));
      setError("");
    } catch (caught) {
      addPending(key, change, -1);
      setCounts((previous) => ({ ...previous, [key]: addTally(previous[key] ?? emptyServeTally(), change, -1) }));
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

  function press(memberId: string, result: ServeResult) {
    const tap: Tap = { memberId, result, delta: 1 };
    feedback(`${memberId}|${result}`);
    setHistory((previous) => [...previous, tap]);
    void send(tap);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) {
      return;
    }
    setHistory((previous) => previous.slice(0, -1));
    feedback(`${last.memberId}|${last.result}`);
    void send({ ...last, delta: -1 });
  }

  // ---- 人を選ぶ ----
  function chooseGroup(group: TrainingGroup | "all") {
    void saveSetup({
      teams: splitServeTeams(servers.filter((player) => group === "all" || toTrainingGroup(player.slot) === group)),
    });
  }
  function resplit() {
    void saveSetup({ teams: splitServeTeams(servers.filter((player) => setup.teams[player.id])) });
  }
  // ↑ で1つ上(出ない → 後半 → 前半)、↓ で1つ下(前半 → 後半 → 出ない)へ移す(スパイクと同じ)。
  function moveTeam(id: string, direction: -1 | 1) {
    const order: (ServeTeam | null)[] = ["first", "second", null];
    const next = order[order.indexOf(setup.teams[id] ?? null) + direction];
    if (next === undefined) {
      return;
    }
    const teams = { ...setup.teams };
    if (next) {
      teams[id] = next;
    } else {
      delete teams[id];
    }
    void saveSetup({ teams });
  }
  function closePicker() {
    setPicking(false);
    // まだだれも保存していなければ、いまの組み方(最初に自動で組んだもの)を保存して、ほかの人とそろえる。
    if (!setupSavedAt.current && canRecord) {
      void saveSetup(setup);
    }
  }

  const byId = new Map(players.map((player) => [player.id, player]));
  const shown = sortByPosition(servers.filter((player) => setup.teams[player.id] === team));
  const teamSize = (entry: ServeTeam) => servers.filter((player) => setup.teams[player.id] === entry).length;
  const teamTally = (entry: ServeTeam) =>
    servers
      .filter((player) => setup.teams[player.id] === entry)
      .reduce((sum, player) => addTally(sum, counts[player.id] ?? emptyServeTally(), 1), emptyServeTally());
  const lastTap = history[history.length - 1];

  return (
    <div className={canRecord ? "tp-counter tp-spike tp-counter-recording" : "tp-counter tp-spike"}>
      <div className="tp-counter-top">
        <div className="tp-counter-filters">
          <div className="tp-seg tp-spike-teams" role="group" aria-label="前半・後半">
            {(["first", "second"] as const).map((entry) => (
              <button key={entry} type="button" aria-pressed={entry === team} onClick={() => chooseTeam(entry)}>
                {SERVE_TEAM_LABELS[entry]} <small>{teamSize(entry)}人</small>
              </button>
            ))}
          </div>
          {canRecord ? (
            <button type="button" className="tp-spike-edit" onClick={() => setPicking(true)}>
              ✎ 人
            </button>
          ) : null}
        </div>
        <p className="tp-spike-round" aria-live="polite">
          <span className="tp-small tp-muted">効果率 =(エース×100 + 効果×25 − ミス×25)÷ 打数</span>
          <span className={online ? "tp-spike-sync" : "tp-spike-sync tp-spike-sync-off"}>
            {online ? "● 反映中" : "○ つながっていません"}
          </span>
        </p>
      </div>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tp-spike-list">
        {shown.map((player) => {
          const tally = counts[player.id] ?? emptyServeTally();
          return (
            <div key={player.id} className="tp-spike-row tp-serve-row">
              <span className="tp-counter-name">
                <b>{player.displayName}</b>
                <small>{player.position}</small>
                <small>
                  {serveAttempts(tally)}本 {formatServeEfficiency(tally)}
                </small>
              </span>
              {SERVE_RESULTS.map((result) => (
                <button
                  key={result}
                  type="button"
                  className={[BUTTON_CLASS[result], flash === `${player.id}|${result}` ? "tp-counter-flash" : ""].join(" ")}
                  disabled={!canRecord}
                  aria-label={`${player.displayName} ${SERVE_RESULT_LABELS[result]}:${tally[result]}本`}
                  onClick={() => press(player.id, result)}
                >
                  <b>{tally[result]}</b>
                  <small>{SERVE_RESULT_LABELS[result]}</small>
                </button>
              ))}
            </div>
          );
        })}
        {shown.length === 0 ? (
          <p className="tp-muted">
            {SERVE_TEAM_LABELS[team]}に打つ人がいません。{canRecord ? "「✎ 人」から選んでください。" : ""}
          </p>
        ) : null}
      </div>

      <div className="tp-counter-dock tp-spike-dock">
        {canRecord ? (
          <button type="button" className="tp-counter-undo" disabled={!lastTap} onClick={undo}>
            ↶ 戻す
          </button>
        ) : null}
        <div className="tp-spike-battle" aria-live="polite">
          <div>
            {(["first", "second"] as const).map((entry) => {
              const tally = teamTally(entry);
              return (
                <span key={entry}>
                  {SERVE_TEAM_LABELS[entry]} {serveAttempts(tally)}本 <small>{formatServeEfficiency(tally)}</small>
                </span>
              );
            })}
          </div>
          <small className="tp-muted">
            {lastTap
              ? `自分の最後:${byId.get(lastTap.memberId)?.displayName ?? "?"} ${SERVE_RESULT_LABELS[lastTap.result]}`
              : "効果 = 相手を崩した。入った = それ以外で入ったサーブ"}
          </small>
        </div>
      </div>

      {picking ? <button type="button" className="tp-counter-backdrop" aria-label="閉じる" onClick={closePicker} /> : null}
      {picking ? (
        <div className="tp-card tp-counter-picker" role="dialog" aria-label="打つ人">
          <div className="tp-counter-picker-head">
            <b>打つ人を前半・後半に分ける</b>
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
              打つのはリベロ以外のプレイヤー。↑↓ で 前半・後半・出ない を移します。前半・後半はポジションが偏らないように分けます。組み方は、このメニューを数えている全員で共有します。
            </p>
          </div>
          {[
            ...(["first", "second"] as const).map((entry) => ({
              title: SERVE_TEAM_LABELS[entry],
              entries: servers.filter((player) => setup.teams[player.id] === entry),
            })),
            { title: "出ない人", entries: servers.filter((player) => !setup.teams[player.id]) },
          ].map((section) => (
            <div key={section.title} className="tp-counter-picker-section">
              <p className="tp-small tp-muted">
                {section.title}・{section.entries.length}人
              </p>
              <div className="tp-counter-picker-list tp-spike-move-list">
                {sortByPosition(section.entries).map((player) => {
                  const now = setup.teams[player.id] ?? null;
                  return (
                    <div key={player.id} className="tp-counter-pick tp-spike-move" aria-pressed={Boolean(now)}>
                      <span>
                        <b>{player.displayName}</b>
                        <small>
                          {player.position} ・ {player.slot ?? "枠なし"}
                        </small>
                      </span>
                      <button
                        type="button"
                        disabled={now === "first"}
                        aria-label={`${player.displayName} を上へ(${now === "second" ? "前半" : "後半"}へ)`}
                        onClick={() => moveTeam(player.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={now === null}
                        aria-label={`${player.displayName} を下へ(${now === "first" ? "後半" : "出ない"}へ)`}
                        onClick={() => moveTeam(player.id, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
function defaultSetup(servers: CounterPlayer[], counts: ServeCount[]): ServeSetup {
  const counted = new Set(counts.map((entry) => entry.memberId));
  return { teams: splitServeTeams(counted.size ? servers.filter((player) => counted.has(player.id)) : servers) };
}
