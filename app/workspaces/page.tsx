import Link from "next/link";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

export const metadata = {
  title: "Saved Workspaces | Play Movie Web",
};

export default async function WorkspacesPage() {
  const workspaces = await listSavedWorkspaces();

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>Saved Workspaces</h1>
            <p>
              サーバー保存した解析ワークスペースを一覧表示します。試合数、更新時刻、ソース種別を見ながら再読込対象を選べます。
            </p>
            <div className="badge-row">
              <Link className="badge badge-link" href="/">
                Back to Workspace
              </Link>
            </div>
          </div>
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">Workspaces</span>
              <strong>{workspaces.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Latest Update</span>
              <strong>{workspaces[0]?.updatedAt?.slice(0, 10) ?? "-"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">
          <div>
            <h2>Workspace Index</h2>
            <p className="muted">保存済みワークスペースの概要です。</p>
          </div>

          {workspaces.length === 0 ? (
            <div className="list-item">
              <strong>保存済みワークスペースはありません。</strong>
              <p className="muted">
                トップページで `.vsm` または `.vsdb` を読み込み、`サーバーへ保存` を実行してください。
              </p>
            </div>
          ) : (
            <div className="workspace-list">
              {workspaces.map((workspace) => (
                <article className="workspace-card" key={workspace.id}>
                  <div className="list-item-header">
                    <div>
                      <strong>{workspace.name}</strong>
                      <p className="muted">{workspace.id}</p>
                    </div>
                    <span className="tag">{workspace.sourceType.toUpperCase()}</span>
                  </div>
                  <div className="meta-grid">
                    <div className="meta-card">
                      <span className="muted">Matches</span>
                      <strong>{workspace.matchCount}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">Updated</span>
                      <strong>{workspace.updatedAt.slice(0, 16).replace("T", " ")}</strong>
                    </div>
                  </div>
                  <div className="button-row">
                    <Link className="button" href={`/workspaces/${workspace.id}`}>
                      詳細を見る
                    </Link>
                    <Link className="button secondary" href={`/?workspaceId=${workspace.id}`}>
                      ホームで開く
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
