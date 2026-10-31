import Link from "next/link";
import { notFound } from "next/navigation";
import { DrillCounter } from "@/components/drill-counter";
import { canRecordDrillStats } from "@/lib/domain/drill-stats";
import { formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamStatsPath } from "@/lib/domain/team";
import { getDrill, listDrillCounts } from "@/lib/server/portal-drill-stat-store";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
    drillId: string;
  }>;
};

export const dynamic = "force-dynamic";

/** 1つのメニューの集計。マネージャーなどは押して数え、ほかの人は本数を見る(2026-10-31 から)。 */
export default async function TeamDrillStatsPage({ params }: PageProps) {
  const { teamSlug, drillId } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamStatsPath(teamSlug, drillId));
  const drill = await getDrill(teamSlug, drillId);
  if (!drill) {
    notFound();
  }
  const [members, counts] = await Promise.all([listMembers(teamSlug), listDrillCounts(drill.id)]);
  const players = members
    .filter((member) => member.position)
    .map(({ id, displayName, position }) => ({ id, displayName, position }));

  return (
    <>
      <header className="tp-hero tp-hero-compact">
        <span className="tp-eyebrow">{formatNoteDate(drill.practiceDate)} の集計</span>
        <h1>{drill.name}</h1>
        <Link className="tp-link tp-small" href={buildTeamStatsPath(teamSlug)}>
          ← 集計の一覧へ
        </Link>
      </header>

      <DrillCounter
        teamSlug={teamSlug}
        drillId={drill.id}
        players={players}
        initialCounts={counts}
        canRecord={canRecordDrillStats(current)}
      />
    </>
  );
}
