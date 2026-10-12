import { cookies } from "next/headers";
import { PortalTopNav } from "@/components/portal-top-nav";
import { TANGO_MODE_ENABLED, isPortalTeam } from "@/lib/domain/portal";
import { getUnreadCounts } from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import "./portal.css";

// 部内ページ(ログイン・名簿・トレーニング)の共通の枠。文字(Google Fonts)は、サイト全体の枠(app/layout.tsx)で読む。
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
  // トグルを止めている間は、前に鉄壁を選んだ端末も通常の見た目で開く(戻す手段がなくなるため)。
  const isTango = TANGO_MODE_ENABLED && (await cookies()).get(MODE_COOKIE)?.value === "tango";

  // 上のバーの「ノート」に、新着のコメントの数を出す(ログインしていなければ 0)。
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  const unreadNotes = current
    ? Object.values(await getUnreadCounts(current.id)).reduce((total, count) => total + count, 0)
    : 0;

  return (
    <div className="tp" data-mode={isTango ? "tango" : "std"}>
      <div className="tp-wrap">
        <PortalTopNav initialTango={isTango} teamSlug={teamSlug} unreadNotes={unreadNotes} />
        {children}
      </div>
    </div>
  );
}
