"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DRILL_GRADES,
  DRILL_GRADE_LABELS,
  DRILL_SKILLS,
  DRILL_SKILL_LABELS,
  type DrillCount,
  type DrillGrade,
  type DrillSkill,
} from "@/lib/domain/drill-stats";
import { MEMBER_POSITIONS, type MemberPosition } from "@/lib/domain/portal";
import { buildTeamApiPath, buildTeamStatsPath } from "@/lib/domain/team";

type CounterPlayer = {
  id: string;
  displayName: string;
  position: MemberPosition | null;
};

type DrillCounterProps = {
  teamSlug: string;
  drillId: string;
  players: CounterPlayer[];
  initialCounts: DrillCount[];
  // 数えられる人(マネージャーなど)。そうでなければ、本数を見るだけ。
  canRecord: boolean;
};

type Tap = { memberId: string; skill: DrillSkill; grade: DrillGrade; delta: 1 | -1 };

const keyOf = (memberId: string, skill: DrillSkill, grade: DrillGrade) => `${memberId}|${skill}|${grade}`;
// このメニューで数える人(端末ごとに覚える)。
const pickedKey = (drillId: string) => `drill-players:${drillId}`;

/**
 * メニューの集計の画面(2026-10-31 から。スマホで片手で数えやすいように作り直した)。
 * - 1人1行。6つの評価のボタンが横に並び、押すたびに1本数える(評価の言葉は、上の固定した見出しに1回だけ出す)
 * - 「戻す」と「−1」は、親指の届く画面の下に固定する。押したら短く光らせ、端末が対応していれば震わせる
 * - 「人を選ぶ」で、このメニューに出ている人だけに絞れる(端末に覚える)
 * 画面の数はすぐ変え、サーバーの返事が来たらその数に合わせる(ほかの人が同時に数えていても、ずれない)。
 */
export function DrillCounter({ teamSlug, drillId, players, initialCounts, canRecord }: DrillCounterProps) {
  const router = useRouter();
  const [skill, setSkill] = useState<DrillSkill>(() =>
    initialCounts.some((entry) => entry.skill === "serve") || !initialCounts.length ? "serve" : "dig",
  );
  const [position, setPosition] = useState<MemberPosition | "all">("all");
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialCounts.map((entry) => [keyOf(entry.memberId, entry.skill, entry.grade), entry.count])),
  );
  const [minus, setMinus] = useState(false);
  const [history, setHistory] = useState<Tap[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // 前に選んだ人を読み出す(読めなくても、全員を出せばよい)。
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(pickedKey(drillId)) ?? "[]") as unknown;
      if (Array.isArray(saved)) {
        setPicked(saved.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      // 端末に保存できない設定なら、毎回全員を出す。
    }
  }, [drillId]);

  function savePicked(next: string[]) {
    setPicked(next);
    try {
      window.localStorage.setItem(pickedKey(drillId), JSON.stringify(next));
    } catch {
      // 保存できなくても、この画面の間は絞れる。
    }
  }

  const countOf = (memberId: string, grade: DrillGrade) => counts[keyOf(memberId, skill, grade)] ?? 0;

  async function send(tap: Tap) {
    const key = keyOf(tap.memberId, tap.skill, tap.grade);
    setCounts((previous) => ({ ...previous, [key]: Math.max((previous[key] ?? 0) + tap.delta, 0) }));
    try {
      const response = await fetch(buildTeamApiPath(`/api/portal/drill-stats/${drillId}`, teamSlug), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tap),
      });
      const payload = (await response.json().catch(() => null)) as { count?: number; error?: string } | null;
      if (!response.ok || typeof payload?.count !== "number") {
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      const saved = payload.count;
      setCounts((previous) => ({ ...previous, [key]: saved }));
      setError("");
    } catch (caught) {
      // 保存できなかった分は、画面の数を戻す。
      setCounts((previous) => ({ ...previous, [key]: Math.max((previous[key] ?? 0) - tap.delta, 0) }));
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

  function press(memberId: string, grade: DrillGrade) {
    const delta: 1 | -1 = minus ? -1 : 1;
    if (delta === -1 && countOf(memberId, grade) === 0) {
      return;
    }
    const tap: Tap = { memberId, skill, grade, delta };
    feedback(keyOf(memberId, skill, grade));
    setHistory((previous) => [...previous, tap]);
    // −1 は1回ごとに戻す(入れっぱなしで数え続けてしまわないように)。
    setMinus(false);
    void send(tap);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) {
      return;
    }
    setHistory((previous) => previous.slice(0, -1));
    if (last.skill !== skill) {
      setSkill(last.skill);
    }
    feedback(keyOf(last.memberId, last.skill, last.grade));
    void send({ ...last, delta: last.delta === 1 ? -1 : 1 });
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

  const pickedSet = new Set(picked);
  const shown = players.filter(
    (player) =>
      (position === "all" || player.position === position) && (picked.length === 0 || pickedSet.has(player.id)),
  );
  const lastTap = history[history.length - 1];
  const lastName = lastTap ? players.find((player) => player.id === lastTap.memberId)?.displayName : null;

  return (
    <div className={canRecord ? "tp-counter tp-counter-recording" : "tp-counter"}>
      <div className="tp-counter-top">
        <div className="tp-counter-filters">
          <div className="tp-seg" role="group" aria-label="スキル">
            {DRILL_SKILLS.map((entry) => (
              <button key={entry} type="button" aria-pressed={entry === skill} onClick={() => setSkill(entry)}>
                {DRILL_SKILL_LABELS[entry]}
              </button>
            ))}
          </div>
          <div className="tp-counter-positions" role="group" aria-label="表示するポジション">
            {(["all", ...MEMBER_POSITIONS] as const).map((entry) => (
              <button key={entry} type="button" aria-pressed={entry === position} onClick={() => setPosition(entry)}>
                {entry === "all" ? "全員" : entry}
              </button>
            ))}
            {canRecord ? (
              <button type="button" aria-pressed={picking} onClick={() => setPicking((previous) => !previous)}>
                {picked.length > 0 ? `${picked.length}人` : "人を選ぶ"}
              </button>
            ) : null}
          </div>
        </div>
        {/* 評価の見出し。下の行のボタンと同じ並び・幅にする。 */}
        <div className="tp-counter-row tp-counter-legend" aria-hidden="true">
          <span className="tp-counter-name" />
          <span className="tp-counter-cells">
            {DRILL_GRADES.map((grade) => (
              <span key={grade} className={`tp-counter-legend-cell tp-grade-${GRADE_CLASS[grade]}`}>
                <b>{grade}</b>
                <small>{DRILL_GRADE_LABELS[skill][grade]}</small>
              </span>
            ))}
          </span>
        </div>
      </div>

      {picking ? (
        <button type="button" className="tp-counter-backdrop" aria-label="閉じる" onClick={() => setPicking(false)} />
      ) : null}
      {picking ? (
        <div className="tp-card tp-counter-picker" role="dialog" aria-label="このメニューに出ている人">
          <p className="tp-small">このメニューに出ている人を選びます(この端末に覚えます)。だれも選ばなければ全員を出します。</p>
          <div className="tp-counter-picker-list">
            {players.map((player) => (
              <label key={player.id}>
                <input
                  type="checkbox"
                  checked={pickedSet.has(player.id)}
                  onChange={(event) =>
                    savePicked(
                      event.target.checked ? [...picked, player.id] : picked.filter((id) => id !== player.id),
                    )
                  }
                />
                {player.displayName}
                <small>{player.position}</small>
              </label>
            ))}
          </div>
          <div className="tp-actions">
            <button type="button" className="tp-button" onClick={() => setPicking(false)}>
              決める
            </button>
            <button type="button" className="tp-button tp-ghost" onClick={() => savePicked([])}>
              全員に戻す
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tp-counter-list">
        {shown.map((player) => {
          const total = DRILL_GRADES.reduce((sum, grade) => sum + countOf(player.id, grade), 0);
          return (
            <div key={player.id} className="tp-counter-row">
              <span className="tp-counter-name">
                <b>{player.displayName}</b>
                <small>
                  {player.position} ・ {total}本
                </small>
              </span>
              <span className="tp-counter-cells">
                {DRILL_GRADES.map((grade) => {
                  const key = keyOf(player.id, skill, grade);
                  const count = countOf(player.id, grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      className={[
                        "tp-counter-cell",
                        `tp-grade-${GRADE_CLASS[grade]}`,
                        count === 0 ? "tp-counter-zero" : "",
                        flash === key ? "tp-counter-flash" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={!canRecord}
                      aria-label={`${player.displayName} の${DRILL_SKILL_LABELS[skill]} ${grade} ${DRILL_GRADE_LABELS[skill][grade]}:${count}本`}
                      onClick={() => press(player.id, grade)}
                    >
                      {count}
                    </button>
                  );
                })}
              </span>
            </div>
          );
        })}
        {shown.length === 0 ? <p className="tp-muted">表示する人がいません。</p> : null}
      </div>

      {canRecord ? (
        <>
          <div className="tp-actions tp-gap">
            <button type="button" className="tp-button tp-ghost" disabled={deleting} onClick={() => void removeDrill()}>
              {deleting ? "消しています…" : "このメニューを消す"}
            </button>
          </div>

          {/* 親指の届く下に固定する操作 */}
          <div className="tp-counter-dock">
            <button type="button" className="tp-counter-undo" disabled={!lastTap} onClick={undo}>
              ↶ 戻す
            </button>
            <span className="tp-counter-last" aria-live="polite">
              {lastTap && lastName
                ? `${lastName} ${DRILL_SKILL_LABELS[lastTap.skill]} ${lastTap.grade}${lastTap.delta === -1 ? " −1" : " +1"}`
                : "押すと1本数えます"}
            </span>
            <button
              type="button"
              className="tp-counter-minus"
              aria-pressed={minus}
              onClick={() => setMinus((previous) => !previous)}
            >
              −1
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// 評価ごとの色の名前(CSS の .tp-grade-*)。
const GRADE_CLASS: Record<DrillGrade, string> = {
  "#": "best",
  "+": "good",
  "!": "ok",
  "-": "poor",
  "/": "over",
  "=": "error",
};
