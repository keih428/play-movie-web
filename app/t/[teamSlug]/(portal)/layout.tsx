import { cookies } from "next/headers";
import { PortalTopNav } from "@/components/portal-top-nav";
import { isPortalTeam } from "@/lib/domain/portal";
import { getUnreadCounts } from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import "./portal.css";

// 部内ページ(ログイン・名簿・トレーニング)の共通の枠。配布版(鉄壁トレーニング)と同じ文字を使う。
// 日本語の書体はビルドに取り込むと数百ファイルになるので、
// Google Fonts から、表示に要る分だけをブラウザに読ませる。
const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500;600&family=Shippori+Mincho+B1:wght@600;800&family=Noto+Serif:ital,wght@0,400;0,700;1,400&display=swap";

const MODE_COOKIE = "portal_mode";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    teamSlug: string;
  }>;
};

export default async function PortalLayout({ children, params }: LayoutProps) {
  const { teamSlug } = await params;
  // 見た目の切り替え(通常 / 鉄壁=単語帳)。端末ごとにクッキーで覚える。
  const isTango = (await cookies()).get(MODE_COOKIE)?.value === "tango";

  // 上のバーの「ノート」に、新着のコメントの数を出す(ログインしていなければ 0)。
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  const unreadNotes = current
    ? Object.values(await getUnreadCounts(current.id)).reduce((total, count) => total + count, 0)
    : 0;

  return (
    <div className="tp" data-mode={isTango ? "tango" : "std"}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONT_STYLESHEET} precedence="default" />
      <div className="tp-wrap">
        <PortalTopNav initialTango={isTango} teamSlug={teamSlug} unreadNotes={unreadNotes} />
        {children}
      </div>
    </div>
  );
}
