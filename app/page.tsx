import Image from "next/image";
import Link from "next/link";
import { buildTeamRootPath } from "@/lib/domain/team";
import { TEAM_CATALOG } from "@/lib/domain/team-catalog";
import { getStaffAppSettings } from "@/lib/server/app-settings-store";

export default async function HomePage() {
  const appSettings = await getStaffAppSettings();

  return (
    <main className="page-shell">
      <section className="panel home-landing-panel">
        <div className="panel-inner stack">
          <div className="home-intro">
            <div
              className="logo-placeholder logo-placeholder-large"
              aria-label="チームロゴ"
            >
              <Image
                className="logo-image logo-image-large"
                src="/logo.png"
                alt="チームロゴ"
                width={320}
                height={180}
                priority
              />
            </div>
            <div>
              <div className="hero-kicker">共通</div>
              <h2>試合レビューを1つの場所で。</h2>
              <p className="muted">
                {appSettings.landingMessage ??
                  "試合ワークスペースを確認し、プレイと映像を行き来しながらレビューできる、バレーチーム向けの環境です。"}
              </p>
            </div>
          </div>

          <div className="button-row">
            {TEAM_CATALOG.map((team) => (
              <Link key={team.slug} className="button" href={buildTeamRootPath(team.slug)}>
                {team.name}
              </Link>
            ))}
          </div>

          <div className="home-steps">
            <article className="home-step">
              <span className="home-step-index">01</span>
              <div>
                <strong>試合一覧を開く</strong>
                <p className="muted">
                  登録済みの試合を一覧から選びます。
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
                  試合外の参考動画は動画ライブラリに蓄積し、テーマごとに参照できます。
                </p>
              </div>
            </article>
          </div>

          <div className="home-feature-band">
            <div className="feature-chip">#試合レビュー</div>
            <div className="feature-chip">#映像ジャンプ</div>
            <div className="feature-chip">#ローテーション確認</div>
            <div className="feature-chip">#共有ワークスペース</div>
          </div>
        </div>
      </section>
    </main>
  );
}
