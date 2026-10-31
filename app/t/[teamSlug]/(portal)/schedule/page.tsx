import { notFound } from "next/navigation";
import { ScheduleShareLinkPanel } from "@/components/schedule-share-link-panel";
import { ScheduleView, type ScheduleQuery } from "@/components/schedule-view";
import { canAdminister, canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamScheduleSharePath, buildTeamSchedulePath } from "@/lib/domain/team";
import { requireMember } from "@/lib/server/portal-session";
import { getShareLinkToken } from "@/lib/server/portal-share-link-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<ScheduleQuery>;
};

export const dynamic = "force-dynamic";

/** 部内ページの予定表。中身は components/schedule-view.tsx(監督向けの共有リンクと同じもの)。 */
export default async function TeamSchedulePage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamSchedulePath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  // 共有リンクを出し入れできるのは、システム担当だけ(けーいちの決定、2026-10-31)。
  const canShare = canManageSite(current);
  const token = canShare ? await getShareLinkToken(teamSlug, "schedule") : null;

  return (
    <ScheduleView
      teamSlug={teamSlug}
      basePath={basePath}
      query={await searchParams}
      showSource={canAdminister(current) || canManageSite(current)}
      footer={
        canShare ? (
          <ScheduleShareLinkPanel
            teamSlug={teamSlug}
            sharePath={token ? buildTeamScheduleSharePath(teamSlug, token) : null}
          />
        ) : null
      }
    />
  );
}
