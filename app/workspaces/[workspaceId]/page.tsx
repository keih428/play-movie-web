import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countMatchPlays,
  countWorkspaceEvents,
  countWorkspacePlays,
  countWorkspaceSets,
  getMatchResultLabel,
  getMatchSetScore,
  getTopSkillsForMatch,
  getWorkspacePrimaryMatch,
} from "@/lib/domain/summary";
import { getSavedWorkspace } from "@/lib/server/workspace-store";
import { CopyShareLinkButton } from "@/components/copy-share-link-button";

type PageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function WorkspaceDetailPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const workspace = await getSavedWorkspace(workspaceId);

  if (!workspace) {
    notFound();
  }

  const totalPlays = countWorkspacePlays(workspace);
  const totalSets = countWorkspaceSets(workspace);
  const totalEvents = countWorkspaceEvents(workspace);
  const primaryMatch = getWorkspacePrimaryMatch(workspace);
  const primaryMatchScore = primaryMatch ? getMatchSetScore(primaryMatch) : null;
  const primaryMatchResult = primaryMatch ? getMatchResultLabel(primaryMatch) : null;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>{workspace.name}</h1>
            <p>
              登録済み試合の詳細です。ここから試合概要を確認し、ホーム画面で映像付きの閲覧に移れます。
            </p>
            <div className="badge-row">
              <Link className="badge badge-link" href="/workspaces">
                一覧へ戻る
              </Link>
              <Link className="badge badge-link" href={`/?workspaceId=${workspace.id}`}>
                ホームで開く
              </Link>
              <CopyShareLinkButton workspaceId={workspace.id} />
            </div>
          </div>

          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">試合数</span>
              <strong>{workspace.collection.matches.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">勝敗</span>
              <strong>{primaryMatchResult ?? "-"}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">セット数</span>
              <strong>{totalSets}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">ラリー数</span>
              <strong>{totalEvents}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">プレイ数</span>
              <strong>{totalPlays}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>ワークスペース情報</h2>
            </div>
            <div className="meta-grid">
              <div className="meta-card">
                <span className="muted">ソース種別</span>
                <strong>{workspace.collection.sourceType.toUpperCase()}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">対戦カード</span>
                <strong>
                  {primaryMatch
                    ? `${primaryMatch.teams.home.name} vs ${primaryMatch.teams.away.name}`
                    : "-"}
                </strong>
              </div>
              <div className="meta-card">
                <span className="muted">選択試合番号</span>
                <strong>{workspace.selectedMatchIndex + 1}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">セットスコア</span>
                <strong>
                  {primaryMatchScore
                    ? `${primaryMatchScore.home}-${primaryMatchScore.away}`
                    : "-"}
                </strong>
              </div>
              <div className="meta-card">
                <span className="muted">登録日時</span>
                <strong>{workspace.createdAt.slice(0, 16).replace("T", " ")}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">更新日時</span>
                <strong>{workspace.updatedAt.slice(0, 16).replace("T", " ")}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>同期設定</h2>
            </div>
            <div className="meta-grid">
              <div className="meta-card">
                <span className="muted">オフセット</span>
                <strong>{workspace.settings.offsetSeconds}s</strong>
              </div>
              <div className="meta-card">
                <span className="muted">プリロール</span>
                <strong>{workspace.settings.prerollSeconds}s</strong>
              </div>
              <div className="meta-card">
                <span className="muted">時刻基準</span>
                <strong>originalTime / 30</strong>
              </div>
              <div className="meta-card">
                <span className="muted">セット別動画</span>
                <strong>{workspace.settings.setVideos?.length ?? 0} 件</strong>
              </div>
            </div>

            {workspace.settings.setVideos?.length ? (
              <div className="workspace-list">
                {workspace.settings.setVideos.map((entry) => (
                  <article className="workspace-card" key={entry.setIndex}>
                    <div className="list-item-header">
                      <strong>セット {entry.setIndex}</strong>
                    </div>
                    <div className="meta-grid">
                      <div className="meta-card">
                        <span className="muted">動画</span>
                        <strong>{entry.youtubeUrl || "-"}</strong>
                      </div>
                      <div className="meta-card">
                        <span className="muted">オフセット</span>
                        <strong>{entry.offsetSeconds}s</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-inner stack">
          <div>
            <h2>試合一覧</h2>
            <p className="muted">試合ごとの件数と主要スキルを確認できます。</p>
          </div>

          <div className="workspace-list">
            {workspace.collection.matches.map((match, index) => {
              const topSkills = getTopSkillsForMatch(match, 6);
              const playCount = countMatchPlays(match);

              return (
                <article className="workspace-card" key={`${match.id}-${index}`}>
                  <div className="list-item-header">
                    <div>
                      <strong>
                        {index + 1}. {match.teams.home.name} vs {match.teams.away.name}
                      </strong>
                      <p className="muted">{match.fileName}</p>
                    </div>
                    <span className="tag">{match.gameType ?? "-"}</span>
                  </div>

                  <div className="meta-grid">
                    <div className="meta-card">
                      <span className="muted">セット数</span>
                      <strong>{match.sets.length}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">プレイ数</span>
                      <strong>{playCount}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">作成日時</span>
                      <strong>{match.createdAt?.slice(0, 16).replace("T", " ") ?? "-"}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">動画パス</span>
                      <strong>{match.video?.path ?? "-"}</strong>
                    </div>
                  </div>

                  <div className="tag-row">
                    {topSkills.map((entry) => (
                      <span className="tag" key={`${match.id}-${entry.skill}`}>
                        {entry.skill}: {entry.count}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
