import Link from "next/link";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

export const metadata = {
  title: "試合一覧 | 東大バレー部 試合ビューア",
};

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
            <p className="muted">新しく追加された試合から順に表示しています。</p>
          </div>

          {workspaces.length === 0 ? (
            <div className="list-item">
              <strong>登録済みの試合はありません。</strong>
              <p className="muted">
                スタッフ設定画面で試合データと動画を紐づけて、試合を登録してください。
              </p>
            </div>
          ) : (
            <div className="workspace-list">
              {workspaces.map((workspace) => (
                <article className="workspace-card" key={workspace.id}>
                  <div className="list-item-header">
                    <div>
                      <strong>{workspace.name}</strong>
                      <p className="muted">{workspace.matchLabel ?? "対戦カード未設定"}</p>
                    </div>
                    <span className="tag">{workspace.resultLabel ?? "結果未取得"}</span>
                  </div>
                  <div className="meta-grid">
                    <div className="meta-card">
                      <span className="muted">セットスコア</span>
                      <strong>{workspace.setScoreLabel ?? "-"}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">登録日時</span>
                      <strong>{workspace.createdAt.slice(0, 16).replace("T", " ")}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">データ形式</span>
                      <strong>{workspace.sourceType.toUpperCase()}</strong>
                    </div>
                  </div>
                  <div className="button-row">
                    <Link className="button" href={`/workspaces/${workspace.id}`}>
                      閲覧する
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
