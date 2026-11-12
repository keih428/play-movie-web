"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ServeDrillResult } from "@/components/serve-drill-result";
import { ServeGradeGuide } from "@/components/serve-grade-guide";
import { useMinusOnce } from "@/components/use-minus-once";
import { MEMBER_POSITIONS, toTrainingGroup, type MemberPosition, type TrainingGroup } from "@/lib/domain/portal";
import {
  SERVE_RESULTS,
  SERVE_RESULT_LABELS,
  SERVE_RESULT_SHORT,
  addServeTally,
  emptyServeTally,
  formatServeEfficiency,
  isServer,
  parseServeSetup,
  serveAttempts,
  serveSetupOf,
  type ServeCount,
  type ServeResult,
  type ServeSetup,
  type ServeTally,
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
  // 打つ人(共有)。まだ選んでいなければ null。
  initialSetup: ServeSetup | null;
  initialSetupSavedAt: string | null;
  canRecord: boolean;
};

type Tap = { memberId: string; result: ServeResult; delta: 1 | -1 };

// 何ミリ秒ごとに、ほかの人が数えた分を取りにいくか(スパイク・レセプションと同じ)。
const POLL_MS = 2000;

const toTallies = (counts: ServeCount[]): Record<string, ServeTally> =>
  Object.fromEntries(counts.map(({ memberId, ...tally }) => [memberId, addServeTally(emptyServeTally(), tally)]));

// # はエース、+ と / は効果(緑の枠)、= はミス(赤)、! と - はふつう。
const BUTTON_CLASS: Record<ServeResult, string> = {
  "#": "tp-spike-kill",
  "+": "tp-spike-kill tp-serve-effect",
  "!": "tp-spike-miss",
  "-": "tp-spike-miss",
  "/": "tp-spike-kill tp-serve-effect",
  "=": "tp-spike-miss tp-serve-miss",
};

/**
 * サーブ効果率の集計の画面(2026-11-10 から。主将の依頼)。1人1行で # + ! - / = の6つのボタン(DataVolley の評価)。
 * - 打つのはリベロ以外のプレイヤー。「✎ 人」で AB・C・全員から選び、1人ずつ足し引きできる。選び方はメニューごとに共有する
 * - 前半・後半には分けない(2026-11-12 から。けーいちの依頼。それまでは前半・後半を切り替えて数えた)
 * - 上の「入力|結果」で、このメニューの結果の表(全員・全体)に切り替えられる(2026-11-10 から)
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
  // 「入力」(ボタンで数える)か「結果」(このメニューの表)か。数えない人(部員)は結果から(2026-11-10 から)。
  const [view, setView] = useState<"input" | "result">(canRecord ? "input" : "result");
  const [history, setHistory] = useState<Tap[]>([]);
  const { minus, toggleMinus, consumeMinus } = useMinusOnce();
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 送っている途中の数(人ごと)と、送った・返事が来たたびに増やす番号。取ってきた数を使ってよいかの判断に使う。
  const pending = useRef(new Map<string, ServeTally>());
  const mutations = useRef(0);
  const savingSetup = useRef(0);

  // まだ選んでいなければ、数える人には最初に「人を選ぶ」を開く。
  useEffect(() => {
    if (!initialSetup && canRecord) {
      setPicking(true);
    }
  }, [canRecord, initialSetup]);

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
        throw new Error(payload?.error ?? "打つ人を保存できませんでした。");
      }
      setupSavedAt.current = payload.setupSavedAt;
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "打つ人を保存できませんでした。");
    } finally {
      savingSetup.current -= 1;
    }
  }

  function addPending(key: string, change: ServeTally, sign: 1 | -1) {
    const now = pending.current.get(key) ?? emptyServeTally();
    // 送っている途中の分は、マイナスにもなる(足し引きだけ。0で止めない)。
    const next = emptyServeTally();
    for (const result of SERVE_RESULTS) {
      next[result] = now[result] + change[result] * sign;
    }
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
    setCounts((previous) => ({ ...previous, [key]: addServeTally(previous[key] ?? emptyServeTally(), change, 1) }));
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
      const saved = addServeTally(payload as ServeTally, rest, 1);
      setCounts((previous) => ({ ...previous, [key]: saved }));
      setError("");
    } catch (caught) {
      addPending(key, change, -1);
      setCounts((previous) => ({ ...previous, [key]: addServeTally(previous[key] ?? emptyServeTally(), change, -1) }));
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
    const delta: 1 | -1 = consumeMinus() ? -1 : 1;
    if (delta === -1 && (counts[memberId]?.[result] ?? 0) === 0) {
      return;
    }
    const tap: Tap = { memberId, result, delta };
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
    void send({ ...last, delta: last.delta === 1 ? -1 : 1 });
  }

  // ---- 人を選ぶ ----
  function chooseGroup(group: TrainingGroup | "all") {
    void saveSetup(serveSetupOf(servers.filter((player) => group === "all" || toTrainingGroup(player.slot) === group)));
  }
  // 1人ずつ足す・外す。
  function toggleServer(id: string, join: boolean) {
    const teams = { ...setup.teams };
    if (join) {
      teams[id] = "first";
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
  const shown = sortByPosition(servers.filter((player) => setup.teams[player.id]));
  const out = sortByPosition(servers.filter((player) => !setup.teams[player.id]));
  const total = shown.reduce((sum, player) => addServeTally(sum, counts[player.id] ?? emptyServeTally()), emptyServeTally());
  const lastTap = history[history.length - 1];

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
          <div className="tp-counter-filters">
            <span className="tp-small tp-muted">{shown.length}人</span>
            {canRecord ? (
              <button type="button" className="tp-spike-edit" onClick={() => setPicking(true)}>
                ✎ 人
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="tp-spike-round" aria-live="polite">
          <span className="tp-small tp-muted">効果は + と /</span>
          <span className={online ? "tp-spike-sync" : "tp-spike-sync tp-spike-sync-off"}>
            {online ? "● 反映中" : "○ つながっていません"}
          </span>
        </p>
        <ServeGradeGuide />
      </div>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      {view === "result" ? (
        <ServeDrillResult players={servers} counts={counts} teams={setup.teams} />
      ) : null}

      {view === "input" ? (
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
                    disabled={!canRecord || (minus && tally[result] === 0)}
                    aria-label={`${player.displayName} ${SERVE_RESULT_LABELS[result]}:${tally[result]}本`}
                    onClick={() => press(player.id, result)}
                  >
                    <b>{tally[result]}</b>
                    <small>
                      {result} {SERVE_RESULT_SHORT[result]}
                    </small>
                  </button>
                ))}
              </div>
            );
          })}
          {shown.length === 0 ? (
            <p className="tp-muted">
              打つ人がいません。{canRecord ? "「✎ 人」から選んでください。" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {view === "input" ? (
        <div className="tp-counter-dock tp-spike-dock">
          {canRecord ? (
            <button type="button" className="tp-counter-undo" disabled={!lastTap} onClick={undo}>
              ↶ 戻す
            </button>
          ) : null}
          <div className="tp-spike-battle" aria-live="polite">
            <div>
              <span>
                全体 {serveAttempts(total)}本 <small>{formatServeEfficiency(total)}</small>
              </span>
            </div>
            <small className="tp-muted">
              {minus
                ? "減らすマスを押してください(1回だけ)"
                : lastTap
                  ? `自分の最後:${byId.get(lastTap.memberId)?.displayName ?? "?"} ${SERVE_RESULT_LABELS[lastTap.result]}${lastTap.delta === -1 ? " −1" : ""}`
                  : "効果率 =(エース×100 + 効果×25 − ミス×25)÷ 打数"}
            </small>
          </div>
          {canRecord ? (
            <button
              type="button"
              className="tp-counter-minus"
              aria-pressed={minus}
              aria-label="次に押したマスを1減らす"
              onClick={toggleMinus}
            >
              −1
            </button>
          ) : null}
        </div>
      ) : null}

      {picking ? <button type="button" className="tp-counter-backdrop" aria-label="閉じる" onClick={closePicker} /> : null}
      {picking ? (
        <div className="tp-card tp-counter-picker" role="dialog" aria-label="打つ人">
          <div className="tp-counter-picker-head">
            <b>打つ人を選ぶ</b>
            <span className="tp-counter-positions" role="group" aria-label="まとめて選ぶ">
              {(["AB", "C", "all"] as const).map((entry) => (
                <button key={entry} type="button" onClick={() => chooseGroup(entry)}>
                  {entry === "all" ? "全員" : entry} で組む
                </button>
              ))}
            </span>
            <p className="tp-small tp-muted">
              打つのはリベロ以外のプレイヤー。× で外し、下の「出ない人」を押すと足せます。選んだ人は、このメニューを数えている全員で共有します。
            </p>
          </div>
          <div className="tp-counter-picker-section">
            <p className="tp-small tp-muted">打つ人・{shown.length}人</p>
            <div className="tp-half-out">
              {shown.map((player) => (
                <PickerItem key={player.id} player={player}>
                  <button type="button" aria-label={`${player.displayName} を出ない人へ`} onClick={() => toggleServer(player.id, false)}>
                    ×
                  </button>
                </PickerItem>
              ))}
            </div>
          </div>
          {out.length > 0 ? (
            <div className="tp-counter-picker-section">
              <p className="tp-small tp-muted">出ない人・{out.length}人(押すと入る)</p>
              <div className="tp-half-out">
                {out.map((player) => (
                  <PickerItem key={player.id} player={player}>
                    <button type="button" aria-label={`${player.displayName} を打つ人へ`} onClick={() => toggleServer(player.id, true)}>
                      ＋
                    </button>
                  </PickerItem>
                ))}
              </div>
            </div>
          ) : null}
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

function PickerItem({ player, children }: { player: CounterPlayer; children: ReactNode }) {
  return (
    <div className="tp-half-item">
      <span>
        <b>{player.displayName}</b>
        <small>
          {player.position} ・ {player.slot ?? "枠なし"}
        </small>
      </span>
      <span className="tp-half-buttons">{children}</span>
    </div>
  );
}

/** まだ選んでいないとき:数えた人がいればその人たちを、いなければ打つ人全員を入れる。 */
function defaultSetup(servers: CounterPlayer[], counts: ServeCount[]): ServeSetup {
  const counted = new Set(counts.map((entry) => entry.memberId));
  return serveSetupOf(counted.size ? servers.filter((player) => counted.has(player.id)) : servers);
}
