import { notFound } from "next/navigation";
import { PortalAccountClient } from "@/components/portal-account-client";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamAccountPath, buildTeamMembersPath, buildTeamRootPath } from "@/lib/domain/team";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ setup?: string; next?: string }>;
};

export const dynamic = "force-dynamic";

/**
 * 自分の合言葉(2026-10-25 から)。部の合言葉に加えて決めておくと、ほかの人があなたの名前を選んでも入れない。
 * ログインのあとで、まだ決めていない人はここに来る(?setup=1。「あとで」で元のページへ)。
 */
export default async function TeamAccountPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const current = await requireMember(teamSlug, buildTeamAccountPath(teamSlug));

  // 戻る先は、このチームのページだけに限る(ログイン画面と同じ)。
  const { setup, next } = await searchParams;
  const returnTo =
    next && next.startsWith(`${buildTeamRootPath(teamSlug)}/`) ? next : buildTeamMembersPath(teamSlug);

  return (
    <PortalAccountClient
      teamSlug={teamSlug}
      displayName={current.displayName}
      initialHasPassphrase={current.hasPassphrase}
      isSetup={setup === "1" && !current.hasPassphrase}
      returnTo={returnTo}
    />
  );
}
