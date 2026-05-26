import Image from "next/image";
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
          <div className="home-intro">
            <div
              className="logo-placeholder logo-placeholder-large"
              aria-label={`${teamName} ロゴ`}
            >
              <Image
                className="logo-image logo-image-large"
                src="/logo.png"
                alt={`${teamName} ロゴ`}
                width={320}
                height={180}
                priority
              />
            </div>
            <div>
              <div className="hero-kicker">{teamName}</div>
              <h2>試合レビューの入口を、ひとつに。</h2>
              <p className="muted">
                公開中の試合ワークスペースを確認し、プレイと映像を行き来しながらレビューできる、
                {teamName} の環境です。
              </p>
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

          <div className="home-steps">
            <article className="home-step">
              <span className="home-step-index">01</span>
              <div>
                <strong>試合一覧を開く</strong>
                <p className="muted">
                  {teamName} に公開された試合を一覧から選び、見たい試合だけを開きます。
                </p>
              </div>
            </article>
            <article className="home-step">
              <span className="home-step-index">02</span>
              <div>
                <strong>映像でレビューする</strong>
                <p className="muted">
                  プレイ一覧から試合映像へ移動し、分析対象のラリーを短時間で確認できます。
                </p>
              </div>
            </article>
            <article className="home-step">
              <span className="home-step-index">03</span>
              <div>
                <strong>動画ライブラリを見る</strong>
                <p className="muted">
                  試合外の参考動画は専用ライブラリに蓄積し、テーマごとに参照できます。
                </p>
              </div>
            </article>
          </div>

          <div className="home-feature-band">
            <div className="feature-chip">公開試合 {teamWorkspaces.length} 件</div>
            <div className="feature-chip">映像ジャンプ</div>
            <div className="feature-chip">ローテーション確認</div>
            <div className="feature-chip">共有ワークスペース</div>
          </div>
        </div>
      </section>
    </main>
  );
}
