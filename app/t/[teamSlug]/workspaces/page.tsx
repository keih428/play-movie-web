import Link from "next/link";
import { formatJstDate, formatJstDateTime } from "@/lib/domain/datetime";
import {
  buildWorkspacePath,
  formatTeamSlugLabel,
} from "@/lib/domain/team";
import type { SavedWorkspaceSummary } from "@/lib/domain/types";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

function getWorkspaceSortDate(workspace: SavedWorkspaceSummary) {
  return workspace.matchDate ?? workspace.createdAt;
}

export default async function TeamWorkspacesPage({ params }: PageProps) {
  const { teamSlug } = await params;
  const workspaces = (await listSavedWorkspaces())
    .filter((workspace) => workspace.teamSlug === teamSlug)
    .sort((left, right) =>
      getWorkspaceSortDate(right).localeCompare(getWorkspaceSortDate(left)),
    );
  const teamName =
    workspaces[0]?.teamName ?? formatTeamSlugLabel(teamSlug) ?? teamSlug;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>試合一覧</h1>
            <p>
              YoutubeとVSMファイルを紐付けた試合を、試合日の新しい順に表示しています。
            </p>
          </div>
          <div className="meta-grid workspaces-meta-grid">
            <div className="meta-card">
              <span className="muted">件数</span>
              <strong>{workspaces.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">最新試合日</span>
              <strong>{formatJstDate(workspaces[0]?.matchDate)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">

          {workspaces.length === 0 ? (
            <div className="list-item">
              <strong>登録された試合はありません。</strong>
              <p className="muted">設定画面でチーム向けに試合を登録すると、ここに表示されます。</p>
            </div>
          ) : (
            <div className="workspace-row-list">
              {workspaces.map((workspace) => (
                <article className="workspace-row" key={workspace.id}>
                  <strong className="workspace-row-title">{workspace.name}</strong>
                  <span className="workspace-row-cell muted">
                    {workspace.matchLabel ?? "対戦カード未設定"}
                  </span>
                  <span className="workspace-row-cell">
                    {workspace.resultLabel ?? "結果未取得"}
                  </span>
                  <span className="workspace-row-cell">
                    {workspace.setScoreLabel ?? "-"}
                  </span>
                  <span className="workspace-row-cell mono">
                    試合日 {formatJstDate(workspace.matchDate)}
                  </span>
                  <span className="workspace-row-cell mono">
                    登録 {formatJstDateTime(workspace.createdAt)}
                  </span>
                  <div className="workspace-row-action">
                    <Link
                      className="button"
                      href={buildWorkspacePath({
                        teamSlug,
                        workspaceId: workspace.id,
                      })}
                    >
                      動画を見る
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
