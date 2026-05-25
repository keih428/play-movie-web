import Link from "next/link";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

export const metadata = {
  title: "試合一覧 | 東大バレー部 試合ビューア",
};

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const workspaces = await listSavedWorkspaces();

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>試合一覧</h1>
            <p>
              スタッフが登録した試合を新しい順に表示しています。試合名、勝敗、登録日時を見ながら閲覧する試合を選べます。
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
              <strong>{workspaces[0]?.createdAt?.slice(0, 10) ?? "-"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">
          <div>
            <h2>登録済み試合</h2>
            <p className="muted">
              新しく追加された試合から順に表示しています。各試合はここから直接、動画とプレイを見比べるレビュー画面で開けます。
            </p>
          </div>

          {workspaces.length === 0 ? (
            <div className="list-item">
              <strong>登録済みの試合はありません。</strong>
              <p className="muted">
                スタッフ設定画面で試合データと動画を紐づけて、試合を登録してください。
              </p>
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
                    {workspace.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                  <div className="workspace-row-action">
                    <Link className="button" href={`/?workspaceId=${workspace.id}`}>
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
