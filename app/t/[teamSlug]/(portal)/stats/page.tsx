import Link from "next/link";
import { notFound } from "next/navigation";
import { DrillCreateForm } from "@/components/drill-create-form";
import { SpikeRankings } from "@/components/spike-rankings";
import {
  DRILL_GRADES,
  DRILL_KIND_LABELS,
  DRILL_GRADE_LABELS,
  DRILL_SKILLS,
  DRILL_SKILL_LABELS,
  canRecordDrillStats,
  emptyGradeCounts,
  getErrorRate,
  getGoodRate,
  tableDrillCounts,
  totalOf,
  type Drill,
  type DrillSkill,
} from "@/lib/domain/drill-stats";
import { formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam, toTrainingGroup } from "@/lib/domain/portal";
import { buildTeamStatsPath } from "@/lib/domain/team";
import { countDrillTotals, listDrills, sumDrillCounts } from "@/lib/server/portal-drill-stat-store";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";
import { sumSpikeCounts } from "@/lib/server/portal-spike-stat-store";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    skill?: string;
    span?: string;
    month?: string;
    group?: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * マネージャーの集計(2026-10-31 から)。練習のメニューごとに、サーブ・ディグを評価ごとに数える。
 * 上でメニューを作り(マネージャーなど)、下にメニューの一覧と、プレイヤーごとの合計を出す(見るのは全員)。
 */
export default async function TeamStatsPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamStatsPath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const today = getTodayInJapan();
  const { skill: requestedSkill, span: requestedSpan, month: requestedMonth, group: requestedGroup } = await searchParams;
  const skill: DrillSkill = requestedSkill === "dig" ? "dig" : "serve";
  const span: "month" | "all" = requestedSpan === "all" ? "all" : "month";
  const from = span === "all" ? "2000-01-01" : `${today.slice(0, 7)}-01`;

  // スパイクの月の順位(2026-11-06 から)。?month=YYYY-MM と ?group=AB|C。
  const spikeMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth ?? "") ? requestedMonth! : today.slice(0, 7);
  const spikeGroup = requestedGroup === "AB" || requestedGroup === "C" ? requestedGroup : "all";

  const [members, drills, totals, sums, spikeCounts] = await Promise.all([
    listMembers(teamSlug),
    listDrills(teamSlug),
    countDrillTotals(teamSlug),
    sumDrillCounts(teamSlug, from),
    sumSpikeCounts(teamSlug, `${spikeMonth}-01`, `${spikeMonth}-31`),
  ]);
  const players = members.filter((member) => member.position);
  const table = tableDrillCounts(sums);
  const canRecord = canRecordDrillStats(current);

  // メニューを日付ごとにまとめる(新しい日から)。
  const byDate = new Map<string, Drill[]>();
  for (const drill of drills) {
    byDate.set(drill.practiceDate, [...(byDate.get(drill.practiceDate) ?? []), drill]);
  }
  // サーブ・ディグとスパイクの切り替えは、お互いの選んだものを残す。
  const spikeQuery = `${requestedMonth ? `&month=${spikeMonth}` : ""}${spikeGroup !== "all" ? `&group=${spikeGroup}` : ""}`;
  const hrefFor = (nextSkill: DrillSkill, nextSpan: "month" | "all") =>
    `${basePath}?skill=${nextSkill}${nextSpan === "all" ? "&span=all" : ""}${spikeQuery}#total`;
  const rate = (value: number | null) => (value === null ? "—" : `${value}%`);

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">サーブ・ディグ・スパイク</span>
        <h1>練習の集計</h1>
        <p className="tp-small tp-muted">
          マネージャーが、練習のメニューごとに数えます。サーブとディグは評価(# + ! - / =)ごと、スパイクは決定と打数を、トスを上げたセッターごとに。
        </p>
      </header>

      {canRecord ? (
        <section className="tp-section">
          <h2>メニューを作って数える</h2>
          <DrillCreateForm teamSlug={teamSlug} today={today} />
        </section>
      ) : null}

      <section className="tp-section">
        <h2>メニュー</h2>
        {drills.length === 0 ? <p className="tp-muted">まだメニューがありません。</p> : null}
        {[...byDate.entries()].map(([date, entries]) => (
          <div key={date} className="tp-card">
            <div className="tp-dayhead">
              <span className="tp-when">{formatNoteDate(date)}</span>
              {date === today ? <span className="tp-time">今日</span> : null}
            </div>
            <ul className="tp-drill-list">
              {entries.map((drill) => (
                <li key={drill.id}>
                  <Link href={buildTeamStatsPath(teamSlug, drill.id)}>
                    {drill.name}
                    <span className="tp-sub">
                      {drill.kind === "spike" ? `${DRILL_KIND_LABELS.spike}・` : ""}
                      {totals.get(drill.id) ?? 0}本
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="tp-section" id="total">
        <h2>サーブ・ディグ:プレイヤーごとの合計</h2>
        <div className="tp-actions">
          <nav className="tp-seg" aria-label="スキル">
            {DRILL_SKILLS.map((entry) => (
              <Link key={entry} href={hrefFor(entry, span)} aria-current={entry === skill ? "true" : undefined} scroll={false}>
                {DRILL_SKILL_LABELS[entry]}
              </Link>
            ))}
          </nav>
          <nav className="tp-seg" aria-label="期間">
            <Link href={hrefFor(skill, "month")} aria-current={span === "month" ? "true" : undefined} scroll={false}>
              今月
            </Link>
            <Link href={hrefFor(skill, "all")} aria-current={span === "all" ? "true" : undefined} scroll={false}>
              これまで全部
            </Link>
          </nav>
        </div>
        <p className="tp-small tp-muted">
          {DRILL_GRADES.map((grade) => `${grade} ${DRILL_GRADE_LABELS[skill][grade]}`).join(" / ")}。「#+」は # と + の割合、「ミス」は = の割合です。
        </p>
        <div className="tp-card tp-scroll">
          <table className="tp-roster tp-stat-table">
            <thead>
              <tr>
                <th>プレイヤー</th>
                {DRILL_GRADES.map((grade) => (
                  <th key={grade}>{grade}</th>
                ))}
                <th>本数</th>
                <th>#+</th>
                <th>ミス</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const counts = table.get(player.id)?.[skill] ?? emptyGradeCounts();
                const total = totalOf(counts);
                return (
                  <tr key={player.id} className={total === 0 ? "tp-stat-empty" : undefined}>
                    <td>
                      <span className="tp-nowrap">{player.displayName}</span>
                      <span className="tp-sub">{player.position}</span>
                    </td>
                    {DRILL_GRADES.map((grade) => (
                      <td key={grade} className="tp-num">
                        {counts[grade] || "—"}
                      </td>
                    ))}
                    <td className="tp-num">{total || "—"}</td>
                    <td className="tp-num">{rate(getGoodRate(counts))}</td>
                    <td className="tp-num">{rate(getErrorRate(counts))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tp-section" id="spike">
        <h2>スパイク:月の順位</h2>
        <SpikeRankings
          basePath={`${basePath}?skill=${skill}${span === "all" ? "&span=all" : ""}`}
          month={spikeMonth}
          group={spikeGroup}
          counts={spikeCounts}
          members={members.map(({ id, displayName, slot }) => ({ id, displayName, group: toTrainingGroup(slot) }))}
        />
      </section>
    </>
  );
}
