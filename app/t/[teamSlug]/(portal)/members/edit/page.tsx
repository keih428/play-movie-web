import { notFound, redirect } from "next/navigation";
import { PortalMembersBulkClient } from "@/components/portal-members-bulk-client";
import { canEditMemberSlot, canManageSite, canOpenMembersBulkEdit, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamMembersBulkEditPath, buildTeamMembersPath } from "@/lib/domain/team";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * 名簿のまとめて編集(システム担当、2026-10-26 から)。全員を1つの表で直して、変えた所だけを保存する。
 * ポジションのリーダーも開けて、自分のまとまりの部員の「枠」だけを直せる(2026-10-31 から)。
 */
export default async function TeamMembersBulkEditPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamMembersBulkEditPath(teamSlug));
  if (!canOpenMembersBulkEdit(current)) {
    redirect(buildTeamMembersPath(teamSlug));
  }

  if (canManageSite(current)) {
    return (
      <PortalMembersBulkClient
        teamSlug={teamSlug}
        initialMembers={await listMembers(teamSlug, { includeInactive: true })}
      />
    );
  }

  // リーダーには、自分のまとまりの、名簿に載っている部員だけを渡す(幹部の印などは渡さない)。
  const members = (await listMembers(teamSlug))
    .filter((member) => canEditMemberSlot(current, member))
    .map((member) => ({ ...member, isExecutive: false, hasPassphrase: false }));
  return <PortalMembersBulkClient teamSlug={teamSlug} initialMembers={members} slotOnly />;
}
