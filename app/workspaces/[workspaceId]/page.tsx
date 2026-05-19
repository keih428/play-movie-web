import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countMatchPlays,
  countWorkspaceEvents,
  countWorkspacePlays,
  countWorkspaceSets,
  getTopSkillsForMatch,
} from "@/lib/domain/summary";
import { getSavedWorkspace } from "@/lib/server/workspace-store";
import { CopyShareLinkButton } from "@/components/copy-share-link-button";

type PageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceDetailPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const workspace = await getSavedWorkspace(workspaceId);

  if (!workspace) {
    notFound();
  }

  const totalPlays = countWorkspacePlays(workspace);
  const totalSets = countWorkspaceSets(workspace);
  const totalEvents = countWorkspaceEvents(workspace);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>{workspace.name}</h1>
            <p>
              保存済みワークスペースの試合サマリです。ホーム画面へ戻れば、この ID を選択してワークスペース本体を再読込できます。
            </p>
            <div className="badge-row">
              <Link className="badge badge-link" href="/workspaces">
                All Workspaces
              </Link>
              <Link className="badge badge-link" href={`/?workspaceId=${workspace.id}`}>
                Open In Home
              </Link>
              <CopyShareLinkButton workspaceId={workspace.id} />
            </div>
          </div>

          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">Matches</span>
              <strong>{workspace.collection.matches.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Sets</span>
              <strong>{totalSets}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Events</span>
              <strong>{totalEvents}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Plays</span>
              <strong>{totalPlays}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>Workspace Metadata</h2>
            </div>
            <div className="meta-grid">
              <div className="meta-card">
                <span className="muted">Source</span>
                <strong>{workspace.collection.sourceType.toUpperCase()}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">Selected Match Index</span>
                <strong>{workspace.selectedMatchIndex}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">Updated</span>
                <strong>{workspace.updatedAt.slice(0, 16).replace("T", " ")}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">YouTube</span>
                <strong>{workspace.settings.youtubeUrl || "-"}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>Sync Settings</h2>
            </div>
            <div className="meta-grid">
              <div className="meta-card">
                <span className="muted">Offset</span>
                <strong>{workspace.settings.offsetSeconds}s</strong>
              </div>
              <div className="meta-card">
                <span className="muted">Preroll</span>
                <strong>{workspace.settings.prerollSeconds}s</strong>
              </div>
              <div className="meta-card">
                <span className="muted">Time Base</span>
                <strong>{workspace.settings.useOriginalTime ? "originalTime" : "time"}</strong>
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-inner stack">
          <div>
            <h2>Matches</h2>
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
                      <span className="muted">Sets</span>
                      <strong>{match.sets.length}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">Plays</span>
                      <strong>{playCount}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">Created</span>
                      <strong>{match.createdAt?.slice(0, 16).replace("T", " ") ?? "-"}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">Video Path</span>
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
