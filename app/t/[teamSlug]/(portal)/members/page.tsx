import { notFound } from "next/navigation";
import { PortalMembersClient } from "@/components/portal-members-client";
import { canManageSite, canOpenMembersBulkEdit, canViewLoginLog, isPortalTeam } from "@/lib/domain/portal";
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
  // 幹部の印は「直す」の中でだけ見せる(けーいちの決定、2026-10-20)。直せない人には、印そのものを渡さない。
  const members = (await listMembers(teamSlug, { includeInactive: canManage })).map((member) =>
    canManage ? member : { ...member, isExecutive: false, hasPassphrase: false },
  );

  return (
    <PortalMembersClient
      canManage={canManage}
      canBulkEdit={canOpenMembersBulkEdit(current)}
      canViewLoginLog={canViewLoginLog(current)}
      currentMemberId={current.id}
      initialMembers={members}
      teamSlug={teamSlug}
    />
  );
}
