"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

/**
 * メニューの集計の画面(2026-10-31 から)。プレイヤーごとに6つの評価のボタンが並び、押すたびに1本数える。
 * 押した順に覚えておき、「1つ戻す」で最後の1本を取り消せる。「−1 にする」を入れると、押したところが1本減る。
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
  const [deleting, setDeleting] = useState(false);

  const countOf = (memberId: string, grade: DrillGrade, target: DrillSkill = skill) =>
    counts[keyOf(memberId, target, grade)] ?? 0;

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
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    }
  }

  function press(memberId: string, grade: DrillGrade) {
    const delta: 1 | -1 = minus ? -1 : 1;
    if (delta === -1 && countOf(memberId, grade) === 0) {
      return;
    }
    const tap: Tap = { memberId, skill, grade, delta };
    setHistory((previous) => [...previous, tap]);
    void send(tap);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) {
      return;
    }
    setHistory((previous) => previous.slice(0, -1));
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

  const shown = players.filter((player) => position === "all" || player.position === position);
  const lastTap = history[history.length - 1];
  const lastName = lastTap ? players.find((player) => player.id === lastTap.memberId)?.displayName : null;

  return (
    <>
      <div className="tp-counter-bar">
        <nav className="tp-seg" aria-label="スキル">
          {DRILL_SKILLS.map((entry) => (
            <button key={entry} type="button" aria-pressed={entry === skill} onClick={() => setSkill(entry)}>
              {DRILL_SKILL_LABELS[entry]}
            </button>
          ))}
        </nav>
        <nav className="tp-seg" aria-label="表示するポジション">
          {(["all", ...MEMBER_POSITIONS] as const).map((entry) => (
            <button key={entry} type="button" aria-pressed={entry === position} onClick={() => setPosition(entry)}>
              {entry === "all" ? "全員" : entry}
            </button>
          ))}
        </nav>
        {canRecord ? (
          <div className="tp-counter-tools">
            <button type="button" className="tp-button tp-ghost" disabled={!lastTap} onClick={undo}>
              1つ戻す
            </button>
            <label className="tp-counter-minus">
              <input type="checkbox" checked={minus} onChange={(event) => setMinus(event.target.checked)} />
              −1 にする
            </label>
            <span className="tp-small tp-muted tp-counter-last">
              {lastTap && lastName
                ? `最後:${lastName} ${DRILL_SKILL_LABELS[lastTap.skill]} ${lastTap.grade}${lastTap.delta === -1 ? "(−1)" : ""}`
                : ""}
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
      {minus ? <p className="tp-note">いまは「−1 にする」が入っています。押したところが1本減ります。</p> : null}

      <div className="tp-counter-list">
        {shown.map((player) => {
          const total = DRILL_GRADES.reduce((sum, grade) => sum + countOf(player.id, grade), 0);
          return (
            <article key={player.id} className="tp-card tp-counter-player">
              <div className="tp-counter-head">
                <strong>{player.displayName}</strong>
                {player.position ? <span className="tp-sub">{player.position}</span> : null}
                <span className="tp-counter-total">{total}本</span>
              </div>
              <div className={`tp-counter-grid${minus ? " tp-counter-grid-minus" : ""}`}>
                {DRILL_GRADES.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    className={`tp-counter-cell tp-grade-${GRADE_CLASS[grade]}`}
                    disabled={!canRecord}
                    aria-label={`${player.displayName} の${DRILL_SKILL_LABELS[skill]} ${grade} ${DRILL_GRADE_LABELS[skill][grade]}:${countOf(player.id, grade)}本`}
                    onClick={() => press(player.id, grade)}
                  >
                    <span className="tp-counter-symbol">{grade}</span>
                    <span className="tp-counter-count">{countOf(player.id, grade)}</span>
                    <span className="tp-counter-label">{DRILL_GRADE_LABELS[skill][grade]}</span>
                  </button>
                ))}
              </div>
            </article>
          );
        })}
        {shown.length === 0 ? <p className="tp-muted">このポジションの人は名簿にいません。</p> : null}
      </div>

      {canRecord ? (
        <div className="tp-actions tp-gap">
          <button type="button" className="tp-button tp-ghost" disabled={deleting} onClick={() => void removeDrill()}>
            {deleting ? "消しています…" : "このメニューを消す"}
          </button>
        </div>
      ) : null}
    </>
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
