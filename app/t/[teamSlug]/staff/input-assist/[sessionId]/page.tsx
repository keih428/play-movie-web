import { notFound } from "next/navigation";
import { InputAssistSessionClient } from "@/components/input-assist/input-assist-session-client";
import { canUseInputAssist } from "@/lib/domain/input-assist/session";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamInputAssistPath } from "@/lib/domain/team";
import { loadInputAssistBundle } from "@/lib/server/input-assist-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
    sessionId: string;
  }>;
};

export const dynamic = "force-dynamic";

/** 打ち込み補助の1試合:準備と P0(ラリーの区切り・サーブの向き)。 */
export default async function InputAssistSessionPage({ params }: PageProps) {
  const { teamSlug, sessionId } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const current = await requireMember(teamSlug, buildTeamInputAssistPath(teamSlug, sessionId));
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

  // 前の形(1試合 = 1つの文書)の試合は、ここではじめて開いたときにセット × パスのスライスに分ける
  const bundle = await loadInputAssistBundle(teamSlug, sessionId);
  if (!bundle) {
    notFound();
  }
  return (
    <InputAssistSessionClient
      initialBundle={bundle}
      currentMember={{ id: current.id, name: current.displayName }}
      teamSlug={teamSlug}
      listHref={buildTeamInputAssistPath(teamSlug)}
    />
  );
}
