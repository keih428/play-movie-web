import { notFound } from "next/navigation";
import { InputAssistListClient } from "@/components/input-assist/input-assist-list-client";
import { canUseInputAssist } from "@/lib/domain/input-assist/session";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamInputAssistPath, formatTeamSlugLabel } from "@/lib/domain/team";
import { listInputAssistSessions } from "@/lib/server/input-assist-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

/** 打ち込み補助(2026-11-10 から):試合の一覧と、新しい試合を作る。使えるのはスタッフとシステム担当。 */
export default async function InputAssistPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const current = await requireMember(teamSlug, buildTeamInputAssistPath(teamSlug));
  if (!canUseInputAssist(current)) {
    return (
      <main className="page-shell">
        <section className="panel">
          <div className="panel-inner">
            <h2>打ち込み補助</h2>
            <p className="muted">使えるのは、スタッフとシステム担当だけです。</p>
          </div>
        </section>
      </main>
    );
  }

  const sessions = await listInputAssistSessions(teamSlug);
  return (
    <InputAssistListClient
      initialSessions={sessions}
      teamSlug={teamSlug}
      homeTeamName={formatTeamSlugLabel(teamSlug)}
    />
  );
}
