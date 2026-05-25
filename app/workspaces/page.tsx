import Link from "next/link";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

export const metadata = {
  title: "保存済みワークスペース一覧 | 東大バレー部 試合ビューア",
};

export default async function WorkspacesPage() {
  const workspaces = await listSavedWorkspaces();

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>保存済みワークスペース</h1>
            <p>
              サーバー保存した解析ワークスペースを一覧表示します。試合数、更新時刻、ソース種別を見ながら再読込対象を選べます。
            </p>
            <div className="badge-row">
              <Link className="badge badge-link" href="/">
                ホームへ戻る
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
              <strong>{workspaces[0]?.updatedAt?.slice(0, 10) ?? "-"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">
          <div>
            <h2>ワークスペース一覧</h2>
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
                      <span className="muted">試合数</span>
                      <strong>{workspace.matchCount}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">更新日時</span>
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
