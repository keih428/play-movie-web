import { notFound, redirect } from "next/navigation";
import { PortalMembersBulkClient } from "@/components/portal-members-bulk-client";
import { canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamMembersBulkEditPath, buildTeamMembersPath } from "@/lib/domain/team";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

/** 名簿のまとめて編集(システム担当だけ、2026-10-26 から)。全員を1つの表で直して、変えた所だけを保存する。 */
export default async function TeamMembersBulkEditPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamMembersBulkEditPath(teamSlug));
  if (!canManageSite(current)) {
    redirect(buildTeamMembersPath(teamSlug));
  }

  return (
    <PortalMembersBulkClient
      teamSlug={teamSlug}
      initialMembers={await listMembers(teamSlug, { includeInactive: true })}
    />
  );
}
