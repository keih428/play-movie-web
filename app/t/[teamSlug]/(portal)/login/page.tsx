import { notFound, redirect } from "next/navigation";
import { PortalLoginClient } from "@/components/portal-login-client";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamHomePath, buildTeamRootPath, formatTeamSlugLabel } from "@/lib/domain/team";
import { getCurrentMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamLoginPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  // ログインのあとに戻る先は、このチームのページだけに限る。
  const { next } = await searchParams;
  const redirectTo =
    next && next.startsWith(`${buildTeamRootPath(teamSlug)}/`) ? next : buildTeamHomePath(teamSlug);

  if (await getCurrentMember(teamSlug)) {
    redirect(redirectTo);
  }

  return (
    <PortalLoginClient
      teamName={formatTeamSlugLabel(teamSlug)}
      teamSlug={teamSlug}
      redirectTo={redirectTo}
    />
  );
}
