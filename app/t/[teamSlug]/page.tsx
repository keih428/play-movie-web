import Link from "next/link";
import {
  buildTeamDataLibraryPath,
  buildTeamStaffSettingsPath,
  buildTeamVideosPath,
  buildTeamWorkspacesPath,
  formatTeamSlugLabel,
} from "@/lib/domain/team";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamHomePage({ params }: PageProps) {
  const { teamSlug } = await params;
  const workspaces = await listSavedWorkspaces();
  const teamWorkspaces = workspaces.filter((workspace) => workspace.teamSlug === teamSlug);
  const teamName =
    teamWorkspaces[0]?.teamName ?? formatTeamSlugLabel(teamSlug) ?? teamSlug;

  return (
    <main className="page-shell">
      <section className="panel home-landing-panel">
        <div className="panel-inner stack">
          <div>
            <div className="hero-kicker">チーム別レビューリンク</div>
            <h2>{teamName} の試合レビュー</h2>
            <p className="muted">
              このページから {teamName} 向けに公開された試合レビューを開けます。
            </p>
          </div>

          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">公開試合数</span>
              <strong>{teamWorkspaces.length}</strong>
            </div>
          </div>

          <div className="button-row">
            <Link className="button" href={buildTeamWorkspacesPath(teamSlug)}>
              試合一覧を見る
            </Link>
            <Link className="button secondary" href={buildTeamStaffSettingsPath(teamSlug)}>
              スタッフ設定
            </Link>
          </div>

          <div className="button-row">
            <Link className="button secondary" href={buildTeamVideosPath(teamSlug)}>
              動画ライブラリ
            </Link>
            <Link className="button secondary" href={buildTeamDataLibraryPath(teamSlug)}>
              試合データ管理
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
