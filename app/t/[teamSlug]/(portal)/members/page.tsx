import { notFound } from "next/navigation";
import { PortalMembersClient } from "@/components/portal-members-client";
import { canManageSite, canViewLoginLog, isPortalTeam } from "@/lib/domain/portal";
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
  const canManage = canManageSite(current);
  const members = await listMembers(teamSlug, { includeInactive: canManage });

  return (
    <PortalMembersClient
      canManage={canManage}
      canViewLoginLog={canViewLoginLog(current)}
      currentMemberId={current.id}
      initialMembers={members}
      teamSlug={teamSlug}
    />
  );
}
