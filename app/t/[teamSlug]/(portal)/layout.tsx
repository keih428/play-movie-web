import { cookies } from "next/headers";
import { PortalTopNav } from "@/components/portal-top-nav";
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
  const isTango = (await cookies()).get(MODE_COOKIE)?.value === "tango";

  return (
    <div className="tp" data-mode={isTango ? "tango" : "std"}>
      <div className="tp-wrap">
        <PortalTopNav initialTango={isTango} teamSlug={teamSlug} />
        {children}
      </div>
    </div>
  );
}
