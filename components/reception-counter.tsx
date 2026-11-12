"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMinusOnce } from "@/components/use-minus-once";
import { MEMBER_POSITIONS, toTrainingGroup, type MemberPosition, type TrainingGroup } from "@/lib/domain/portal";
import {
  formatPassRate,
  isDefaultReceiver,
  parseReceptionSetup,
  type ReceptionCount,
  type ReceptionSetup,
} from "@/lib/domain/reception-stats";
import { buildTeamApiPath } from "@/lib/domain/team";

type CounterPlayer = {
  id: string;
  displayName: string;
  position: MemberPosition | null;
  // 名簿の枠(A・B・C)。AB/C で選ぶのに使う。
  slot: string | null;
};

type ReceptionCounterProps = {
  teamSlug: string;
  drillId: string;
  players: CounterPlayer[];
  initialCounts: ReceptionCount[];
  // 受ける人の選び方(共有)。まだ選んでいなければ null。
  initialSetup: ReceptionSetup | null;
  initialSetupSavedAt: string | null;
  canRecord: boolean;
};

type Tap = { memberId: string; pass: boolean; delta: 1 | -1 };
type Cell = { passes: number; attempts: number };

// 何ミリ秒ごとに、ほかの人が数えた分を取りにいくか(スパイクと同じ)。
const POLL_MS = 2000;
const EMPTY: Cell = { passes: 0, attempts: 0 };

const toCells = (counts: ReceptionCount[]): Record<string, Cell> =>
  Object.fromEntries(counts.map((entry) => [entry.memberId, { passes: entry.passes, attempts: entry.attempts }]));

/**
 * レセプションの集計の画面(2026-11-06 から。主将の依頼)。1人1行で「ABパス」「それ以外」の2つのボタン。
 * - 最初に「✎ 人」で受ける人を選ぶ(AB/C/全員で、OH・OP・リベロを一度に選べる)。選び方はメニューごとに共有する
 * - マネージャーが何人かで同時に数えられるよう、2秒ごとにほかの人が数えた分と選び方を取りにいく
 *   (自分が送っている途中の分があるときは、取ってきたものを使わない。スパイクと同じ)
 */
export function ReceptionCounter({
  teamSlug,
  drillId,
  players,
  initialCounts,
  initialSetup,
  initialSetupSavedAt,
  canRecord,
}: ReceptionCounterProps) {
  const apiPath = buildTeamApiPath(`/api/portal/drill-stats/${drillId}/reception`, teamSlug);
  const [counts, setCounts] = useState<Record<string, Cell>>(() => toCells(initialCounts));
  const [setup, setSetup] = useState<ReceptionSetup>(
    () => initialSetup ?? defaultSetup(players, initialCounts),
  );
  const setupSavedAt = useRef(initialSetupSavedAt);
  const [picking, setPicking] = useState(false);
  const [history, setHistory] = useState<Tap[]>([]);
  const { minus, toggleMinus, consumeMinus } = useMinusOnce();
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 送っている途中の数(人ごと)と、送った・返事が来たたびに増やす番号。取ってきた数を使ってよいかの判断に使う。
  const pending = useRef(new Map<string, Cell>());
  const mutations = useRef(0);
  const savingSetup = useRef(0);

  // まだだれも選んでいなければ、数える人には最初に「人を選ぶ」を開く。
  useEffect(() => {
    if (!initialSetup && canRecord) {
      setPicking(true);
    }
  }, [initialSetup, canRecord]);

  // ---- ほかの人が数えた分を取りにいく ----
  const poll = useCallback(async () => {
    const startedAt = mutations.current;
    try {
      const response = await fetch(apiPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error();
      }
      const payload = (await response.json()) as {
        counts?: ReceptionCount[];
        setup?: unknown;
        setupSavedAt?: string | null;
      };
      setOnline(true);
      if (mutations.current === startedAt && pending.current.size === 0 && Array.isArray(payload.counts)) {
        setCounts(toCells(payload.counts));
      }
      const remote = parseReceptionSetup(payload.setup);
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

  async function saveSetup(next: ReceptionSetup) {
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
        throw new Error(payload?.error ?? "受ける人を保存できませんでした。");
      }
      setupSavedAt.current = payload.setupSavedAt;
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "受ける人を保存できませんでした。");
    } finally {
      savingSetup.current -= 1;
    }
  }

  function addPending(key: string, cell: Cell, sign: 1 | -1) {
    const now = pending.current.get(key) ?? EMPTY;
    const next = { passes: now.passes + cell.passes * sign, attempts: now.attempts + cell.attempts * sign };
    if (next.passes === 0 && next.attempts === 0) {
      pending.current.delete(key);
    } else {
      pending.current.set(key, next);
    }
  }

  async function send(tap: Tap) {
    const key = tap.memberId;
    const change: Cell = { passes: tap.pass ? tap.delta : 0, attempts: tap.delta };
    const apply = (cell: Cell, sign: 1 | -1): Cell => {
      const attempts = Math.max(cell.attempts + change.attempts * sign, 0);
      return { attempts, passes: Math.min(Math.max(cell.passes + change.passes * sign, 0), attempts) };
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
        | { passes?: number; attempts?: number; error?: string }
        | null;
      if (!response.ok || typeof payload?.passes !== "number" || typeof payload.attempts !== "number") {
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      addPending(key, change, -1);
      const rest = pending.current.get(key) ?? EMPTY;
      const saved = { passes: payload.passes + rest.passes, attempts: payload.attempts + rest.attempts };
      setCounts((previous) => ({ ...previous, [key]: saved }));
      setError("");
    } catch (caught) {
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

  function press(memberId: string, pass: boolean) {
    const delta: 1 | -1 = consumeMinus() ? -1 : 1;
    const cell = counts[memberId] ?? EMPTY;
    if (delta === -1 && (pass ? cell.passes : cell.attempts - cell.passes) === 0) {
      return;
    }
    const tap: Tap = { memberId, pass, delta };
    feedback(`${memberId}|${pass ? "pass" : "other"}`);
    setHistory((previous) => [...previous, tap]);
    void send(tap);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) {
      return;
    }
    setHistory((previous) => previous.slice(0, -1));
    feedback(`${last.memberId}|${last.pass ? "pass" : "other"}`);
    void send({ ...last, delta: last.delta === 1 ? -1 : 1 });
  }

  // ---- 人を選ぶ ----
  function chooseGroup(group: TrainingGroup | "all") {
    void saveSetup({
      members: sortByPosition(
        players.filter(
          (player) =>
            isDefaultReceiver(player.position) && (group === "all" || toTrainingGroup(player.slot) === group),
        ),
      ).map((player) => player.id),
    });
  }
  function toggle(id: string) {
    void saveSetup({
      members: setup.members.includes(id) ? setup.members.filter((entry) => entry !== id) : [...setup.members, id],
    });
  }
  function closePicker() {
    setPicking(false);
    // まだだれも保存していなければ、いまの選び方(最初に自動で選んだもの)を保存して、ほかの人とそろえる。
    if (!setupSavedAt.current && canRecord) {
      void saveSetup(setup);
    }
  }

  const byId = new Map(players.map((player) => [player.id, player]));
  const shown = setup.members.map((id) => byId.get(id)).filter((player): player is CounterPlayer => Boolean(player));
  const total = Object.values(counts).reduce(
    (sum, cell) => ({ passes: sum.passes + cell.passes, attempts: sum.attempts + cell.attempts }),
    EMPTY,
  );
  const lastTap = history[history.length - 1];

  return (
    <div className={canRecord ? "tp-counter tp-spike tp-counter-recording" : "tp-counter tp-spike"}>
      <div className="tp-counter-top">
        <div className="tp-counter-filters">
          <p className="tp-spike-round">
            <span>
              受ける人 <b>{shown.length}</b>人
            </span>
          </p>
          {canRecord ? (
            <button type="button" className="tp-spike-edit" onClick={() => setPicking(true)}>
              ✎ 人
            </button>
          ) : null}
        </div>
        <p className="tp-spike-round" aria-live="polite">
          <span className="tp-small tp-muted">ABパス(A・Bの返球)か、それ以外か</span>
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
          const cell = counts[player.id] ?? EMPTY;
          return (
            <div key={player.id} className="tp-spike-row tp-reception-row">
              <span className="tp-counter-name">
                <b>{player.displayName}</b>
                <small>{player.position}</small>
                <small>
                  {cell.passes}/{cell.attempts} {formatPassRate(cell.passes, cell.attempts)}
                </small>
              </span>
              {([true, false] as const).map((pass) => (
                <button
                  key={String(pass)}
                  type="button"
                  className={[
                    pass ? "tp-spike-kill" : "tp-spike-miss",
                    flash === `${player.id}|${pass ? "pass" : "other"}` ? "tp-counter-flash" : "",
                  ].join(" ")}
                  disabled={!canRecord || (minus && (pass ? cell.passes : cell.attempts - cell.passes) === 0)}
                  aria-label={`${player.displayName} ${pass ? "ABパス" : "それ以外"}:${pass ? cell.passes : cell.attempts - cell.passes}本`}
                  onClick={() => press(player.id, pass)}
                >
                  <b>{pass ? cell.passes : cell.attempts - cell.passes}</b>
                  <small>{pass ? "ABパス" : "それ以外"}</small>
                </button>
              ))}
            </div>
          );
        })}
        {shown.length === 0 ? (
          <p className="tp-muted">受ける人がいません。{canRecord ? "「✎ 人」から選んでください。" : ""}</p>
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
            <span>
              全体 {total.passes}/{total.attempts} <small>{formatPassRate(total.passes, total.attempts)}</small>
            </span>
          </div>
          <small className="tp-muted">
            {minus
              ? "減らすマスを押してください(1回だけ)"
              : lastTap
                ? `自分の最後:${byId.get(lastTap.memberId)?.displayName ?? "?"} ${lastTap.pass ? "ABパス" : "それ以外"}${lastTap.delta === -1 ? " −1" : ""}`
                : "押すと1本数えます"}
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

      {picking ? <button type="button" className="tp-counter-backdrop" aria-label="閉じる" onClick={closePicker} /> : null}
      {picking ? (
        <div className="tp-card tp-counter-picker" role="dialog" aria-label="受ける人">
          <div className="tp-counter-picker-head">
            <b>受ける人を選ぶ</b>
            <span className="tp-counter-positions" role="group" aria-label="まとめて選ぶ">
              {(["AB", "C", "all"] as const).map((entry) => (
                <button key={entry} type="button" onClick={() => chooseGroup(entry)}>
                  {entry === "all" ? "全員" : entry} の OH・OP・Li
                </button>
              ))}
            </span>
            <p className="tp-small tp-muted">押すと入る・外す。選び方は、このメニューを数えている全員で共有します。</p>
          </div>
          {[
            { title: "受ける人(押すと外す)", entries: shown },
            {
              title: "ほかの人(押すと足す)",
              entries: sortByPosition(players.filter((player) => !setup.members.includes(player.id))),
            },
          ].map((section) =>
            section.entries.length ? (
              <div key={section.title} className="tp-counter-picker-section">
                <p className="tp-small tp-muted">
                  {section.title}・{section.entries.length}人
                </p>
                <div className="tp-counter-picker-list">
                  {section.entries.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className="tp-counter-pick"
                      aria-pressed={setup.members.includes(player.id)}
                      onClick={() => toggle(player.id)}
                    >
                      <b>{player.displayName}</b>
                      <small>
                        {player.position} ・ {player.slot ?? "枠なし"}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null,
          )}
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

/** まだ選んでいないとき:数えた人がいればその人たちを、いなければ OH・OP・リベロ全員を出す。 */
function defaultSetup(players: CounterPlayer[], counts: ReceptionCount[]): ReceptionSetup {
  const counted = new Set(counts.map((entry) => entry.memberId));
  return {
    members: sortByPosition(
      players.filter((player) => (counted.size ? counted.has(player.id) : isDefaultReceiver(player.position))),
    ).map((player) => player.id),
  };
}
