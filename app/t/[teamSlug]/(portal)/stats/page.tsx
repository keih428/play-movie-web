import Link from "next/link";
import { notFound } from "next/navigation";
import { DrillCreateForm } from "@/components/drill-create-form";
import { ReceptionRankings } from "@/components/reception-rankings";
import { SpikeRankings } from "@/components/spike-rankings";
import {
  DRILL_GRADES,
  DRILL_GRADE_LABELS,
  DRILL_SKILL_LABELS,
  STATS_TAB_LABELS,
  VISIBLE_STATS_TABS,
  canRecordDrillStats,
  drillKindOfTab,
  emptyGradeCounts,
  getErrorRate,
  getGoodRate,
  isArchivedStatsTab,
  parseStatsTab,
  tableDrillCounts,
  totalOf,
  type Drill,
  type StatsTab,
} from "@/lib/domain/drill-stats";
import { formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam, toTrainingGroup } from "@/lib/domain/portal";
import { buildTeamStatsPath } from "@/lib/domain/team";
import { countDrillTotals, listDrills, sumDrillCounts } from "@/lib/server/portal-drill-stat-store";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";
import { sumReceptionCounts } from "@/lib/server/portal-reception-stat-store";
import { sumSpikeCounts } from "@/lib/server/portal-spike-stat-store";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    tab?: string;
    skill?: string;
    span?: string;
    month?: string;
    group?: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * マネージャーの集計(2026-10-31 から)。練習のメニューごとに数える。タブ(?tab=)ごとに、上でメニューを作り(マネージャーなど)、
 * 下にメニューの一覧と、月の順位(スパイク・レセプション)か合計(サーブ・ディグ)を出す(見るのは全員)。
 * タブに出すのはスパイクとレセプション(2026-11-06 から)。サーブ・ディグはアーカイブで、?tab=serve / dig で開ける。
 */
export default async function TeamStatsPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamStatsPath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const today = getTodayInJapan();
  const {
    tab: requestedTab,
    skill: requestedSkill,
    span: requestedSpan,
    month: requestedMonth,
    group: requestedGroup,
  } = await searchParams;
  const tab = parseStatsTab(requestedTab, requestedSkill);
  const skill = tab === "dig" ? "dig" : "serve";
  const kind = drillKindOfTab(tab);
  const span: "month" | "all" = requestedSpan === "all" ? "all" : "month";
  const from = span === "all" ? "2000-01-01" : `${today.slice(0, 7)}-01`;

  // スパイク・レセプションの月の順位(2026-11-06 から)。?month=YYYY-MM と ?group=AB|C。
  const spikeMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth ?? "") ? requestedMonth! : today.slice(0, 7);
  const spikeGroup = requestedGroup === "AB" || requestedGroup === "C" ? requestedGroup : "all";

  const [members, allDrills, totals, sums, spikeCounts, receptionCounts] = await Promise.all([
    listMembers(teamSlug),
    listDrills(teamSlug),
    countDrillTotals(teamSlug),
    tab === "serve" || tab === "dig" ? sumDrillCounts(teamSlug, from) : Promise.resolve([]),
    tab === "spike" ? sumSpikeCounts(teamSlug, `${spikeMonth}-01`, `${spikeMonth}-31`) : Promise.resolve([]),
    tab === "reception" ? sumReceptionCounts(teamSlug, `${spikeMonth}-01`, `${spikeMonth}-31`) : Promise.resolve([]),
  ]);
  // このタブのメニューだけ(サーブとディグは同じメニューで両方数えるので、どちらのタブにも出る)。
  const drills = allDrills.filter((drill) => drill.kind === kind);
  const players = members.filter((member) => member.position);
  const table = tableDrillCounts(sums);
  const canRecord = canRecordDrillStats(current);

  // メニューを日付ごとにまとめる(新しい日から)。
  const byDate = new Map<string, Drill[]>();
  for (const drill of drills) {
    byDate.set(drill.practiceDate, [...(byDate.get(drill.practiceDate) ?? []), drill]);
  }
  const tabHref = (next: StatsTab) => `${basePath}?tab=${next}`;
  const spanHref = (nextSpan: "month" | "all") => `${tabHref(tab)}${nextSpan === "all" ? "&span=all" : ""}#total`;
  // メニューを開くと、このタブのスキルで数えはじめる。
  const drillHref = (drill: Drill) =>
    `${buildTeamStatsPath(teamSlug, drill.id)}${drill.kind === "serve_dig" ? `?skill=${skill}` : ""}`;
  const rate = (value: number | null) => (value === null ? "—" : `${value}%`);

  return (
    <>
      <header className="tp-hero">
        <h1>練習の集計</h1>
        <p className="tp-small tp-muted">
          {tab === "spike"
            ? "マネージャーが、練習のメニューごとに、スパイクの決定と打数をトスを上げたセッターごとに数えます。"
            : tab === "reception"
              ? "マネージャーが、練習のメニューごとに、レセプションがABパスかどうかを数えます。"
              : `アーカイブ:${STATS_TAB_LABELS[tab]}の集計はいまは取っていません。これまでの記録を見られます。`}
        </p>
      </header>

      <nav className="tp-seg tp-stats-tabs" aria-label="数えるもの">
        {VISIBLE_STATS_TABS.map((entry) => (
          <Link key={entry} href={tabHref(entry)} aria-current={entry === tab ? "true" : undefined}>
            {STATS_TAB_LABELS[entry]}
          </Link>
        ))}
      </nav>

      {canRecord && !isArchivedStatsTab(tab) ? (
        <section className="tp-section">
          <h2>メニューを作って数える</h2>
          <DrillCreateForm teamSlug={teamSlug} today={today} tab={tab} />
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
                  <Link href={drillHref(drill)}>
                    {drill.name}
                    <span className="tp-sub">{totals.get(drill.id) ?? 0}本</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {tab === "spike" ? (
        <section className="tp-section">
          <h2>サーブのレベル</h2>
          <p className="tp-small tp-muted">
            前衛 OH・OP は、サーブを受けてから打ちます(Lv1 逆回転 → Lv2 スタンディングフローター → Lv3
            ジャンプフローター)。受けるサーブのレベルは1人ずつ名簿で決めます(はじめは全員 Lv1。システム担当と、OH・OP
            のリーダーが名簿の「編集」から Lv2・Lv3 に変えられます)。打った本数はレベルごとに分けて数え、月の順位もレベル別です。
          </p>
        </section>
      ) : null}

      {tab === "reception" ? (
        <section className="tp-section" id="reception">
          <h2>月の順位</h2>
          <ReceptionRankings
            basePath={tabHref("reception")}
            month={spikeMonth}
            group={spikeGroup}
            counts={receptionCounts}
            members={members.map(({ id, displayName, slot }) => ({ id, displayName, group: toTrainingGroup(slot) }))}
          />
        </section>
      ) : tab === "spike" ? (
        <section className="tp-section" id="spike">
          <h2>月の順位</h2>
          <SpikeRankings
            basePath={tabHref("spike")}
            month={spikeMonth}
            group={spikeGroup}
            counts={spikeCounts}
            members={members.map(({ id, displayName, slot }) => ({ id, displayName, group: toTrainingGroup(slot) }))}
          />
        </section>
      ) : (
        <section className="tp-section" id="total">
          <h2>{DRILL_SKILL_LABELS[skill]}:プレイヤーごとの合計</h2>
          <div className="tp-actions">
            <nav className="tp-seg" aria-label="期間">
              <Link href={spanHref("month")} aria-current={span === "month" ? "true" : undefined} scroll={false}>
                今月
              </Link>
              <Link href={spanHref("all")} aria-current={span === "all" ? "true" : undefined} scroll={false}>
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
      )}
    </>
  );
}
