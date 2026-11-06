import Link from "next/link";
import { notFound } from "next/navigation";
import { DrillCounter } from "@/components/drill-counter";
import { DrillMenu } from "@/components/drill-menu";
import { ReceptionCounter } from "@/components/reception-counter";
import { SpikeCounter } from "@/components/spike-counter";
import { canRecordDrillStats } from "@/lib/domain/drill-stats";
import { formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamStatsPath } from "@/lib/domain/team";
import { levelStatusOf, spikeRounds } from "@/lib/domain/spike-stats";
import { getDrill, listDrillCounts } from "@/lib/server/portal-drill-stat-store";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";
import { getReceptionSetup, listReceptionCounts } from "@/lib/server/portal-reception-stat-store";
import { getSpikeSetup, listLevelSessions, listSpikeCounts } from "@/lib/server/portal-spike-stat-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
    drillId: string;
  }>;
  searchParams: Promise<{
    skill?: string;
  }>;
};

export const dynamic = "force-dynamic";

/** 1つのメニューの集計。マネージャーなどは押して数え、ほかの人は本数を見る(2026-10-31 から。スパイクは 2026-11-06 から)。 */
export default async function TeamDrillStatsPage({ params, searchParams }: PageProps) {
  const { teamSlug, drillId } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamStatsPath(teamSlug, drillId));
  const drill = await getDrill(teamSlug, drillId);
  if (!drill) {
    notFound();
  }
  // 一覧のタブから来たら、そのスキルで数えはじめ、一覧の同じタブへ戻る(2026-11-06 から)。
  const { skill: requestedSkill } = await searchParams;
  const skill = requestedSkill === "dig" ? "dig" : requestedSkill === "serve" ? "serve" : null;
  const backTab = drill.kind === "serve_dig" ? (skill ?? "serve") : drill.kind;
  const players = (await listMembers(teamSlug))
    .filter((member) => member.position)
    .map(({ id, displayName, position, slot }) => ({ id, displayName, position, slot }));
  const canRecord = canRecordDrillStats(current);
  // 「このメニューを消す」は、押しまちがえないよう右上の「⋯」の中に入れる(2026-11-06 から)。
  const header = (
    <header className="tp-hero tp-hero-compact tp-hero-menu">
      {canRecord ? <DrillMenu teamSlug={teamSlug} drillId={drill.id} backTab={backTab} /> : null}
      <span className="tp-eyebrow">{formatNoteDate(drill.practiceDate)} の集計</span>
      <h1>{drill.name}</h1>
      <Link className="tp-link tp-small" href={`${buildTeamStatsPath(teamSlug)}?tab=${backTab}`}>
        ← 集計の一覧へ
      </Link>
    </header>
  );

  // レセプション(2026-11-06 から)。
  if (drill.kind === "reception") {
    const [receptionCounts, { setup, savedAt }] = await Promise.all([
      listReceptionCounts(drill.id),
      getReceptionSetup(drill.id),
    ]);
    return (
      <>
        {header}
        <ReceptionCounter
          teamSlug={teamSlug}
          drillId={drill.id}
          players={players}
          initialCounts={receptionCounts}
          initialSetup={setup}
          initialSetupSavedAt={savedAt}
          canRecord={canRecord}
        />
      </>
    );
  }

  // スパイク練習(2026-11-06 から)。
  if (drill.kind === "spike") {
    const [spikeCounts, sessions, { setup, savedAt }] = await Promise.all([
      listSpikeCounts(drill.id),
      listLevelSessions(teamSlug, drill),
      getSpikeSetup(drill.id),
    ]);
    // 昇格の条件(10本中5本)は、セッター2人のときの周数で見る。
    const { rounds } = spikeRounds(2);
    const levelStatus = Object.fromEntries(
      players.map((player) => [player.id, levelStatusOf(sessions.get(player.id) ?? [], rounds)]),
    );
    return (
      <>
        {header}
        <SpikeCounter
          teamSlug={teamSlug}
          drillId={drill.id}
          players={players}
          initialCounts={spikeCounts}
          initialSetup={setup}
          initialSetupSavedAt={savedAt}
          levelStatus={levelStatus}
          canRecord={canRecord}
        />
      </>
    );
  }

  const counts = await listDrillCounts(drill.id);

  return (
    <>
      {header}

      <DrillCounter
        teamSlug={teamSlug}
        drillId={drill.id}
        players={players}
        initialCounts={counts}
        initialSkill={skill}
        canRecord={canRecord}
      />
    </>
  );
}
