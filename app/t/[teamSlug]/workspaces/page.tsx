import Link from "next/link";
import { formatJstDate, formatJstDateTime } from "@/lib/domain/datetime";
import {
  buildTeamRootPath,
  buildWorkspacePath,
  formatTeamSlugLabel,
} from "@/lib/domain/team";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamWorkspacesPage({ params }: PageProps) {
  const { teamSlug } = await params;
  const workspaces = (await listSavedWorkspaces()).filter(
    (workspace) => workspace.teamSlug === teamSlug,
  );
  const teamName =
    workspaces[0]?.teamName ?? formatTeamSlugLabel(teamSlug) ?? teamSlug;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>{teamName} の試合一覧</h1>
            <p>
              {teamName} 向けに公開された試合を新しい順に表示しています。ここから直接レビュー画面へ入れます。
            </p>
            <div className="badge-row">
              <Link className="badge badge-link" href={buildTeamRootPath(teamSlug)}>
                チームページへ戻る
              </Link>
            </div>
          </div>
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">件数</span>
              <strong>{workspaces.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">最新更新日</span>
              <strong>{formatJstDate(workspaces[0]?.createdAt)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">
          <div>
            <h2>公開中の試合</h2>
            <p className="muted">このチーム向けに共有された試合だけを表示しています。</p>
          </div>

          {workspaces.length === 0 ? (
            <div className="list-item">
              <strong>公開中の試合はありません。</strong>
              <p className="muted">スタッフ設定画面でこのチーム向けに試合を保存すると、ここに表示されます。</p>
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
                    {formatJstDateTime(workspace.createdAt)}
                  </span>
                  <div className="workspace-row-action">
                    <Link
                      className="button"
                      href={buildWorkspacePath({
                        teamSlug,
                        workspaceId: workspace.id,
                      })}
                    >
                      動画とプレイで見る
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
