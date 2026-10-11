import { notFound } from "next/navigation";
import { PortalMembersClient } from "@/components/portal-members-client";
import { canAdminister, canViewLoginLog, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamMembersPath } from "@/lib/domain/team";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamMembersPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamMembersPath(teamSlug));
  const canManage = canAdminister(current.role);
  const members = await listMembers(teamSlug, { includeInactive: canManage });

  return (
    <main className="page-shell stack">
      <PortalMembersClient
        canManage={canManage}
        canViewLoginLog={canViewLoginLog(current.role)}
        currentMemberId={current.id}
        initialMembers={members}
        teamSlug={teamSlug}
      />
    </main>
  );
}
