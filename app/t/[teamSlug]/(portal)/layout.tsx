import { cookies } from "next/headers";
import { TANGO_MODE_ENABLED } from "@/lib/domain/portal";
import "./portal.css";

// 部内ページ(ログイン・名簿・トレーニング)の共通の枠。文字(Google Fonts)は、サイト全体の枠(app/layout.tsx)で読む。
// 上のバーは、試合のページと同じもの(components/site-header-nav.tsx)を、サイト全体の枠で出す(2026-10-20 から)。
const MODE_COOKIE = "portal_mode";

type LayoutProps = {
  children: React.ReactNode;
};

export default async function PortalLayout({ children }: LayoutProps) {
  // 見た目の切り替え(通常 / 鉄壁=単語帳)。端末ごとにクッキーで覚える。
  // トグルを止めている間は、前に鉄壁を選んだ端末も通常の見た目で開く(戻す手段がなくなるため)。
  // トグルは上のバーにあった(2026-10-20 に上のバーを1つにしたときに外した。戻すなら git の履歴の components/portal-top-nav.tsx)。
  const isTango = TANGO_MODE_ENABLED && (await cookies()).get(MODE_COOKIE)?.value === "tango";

  return (
    <div className="tp" data-mode={isTango ? "tango" : "std"}>
      <div className="tp-wrap">{children}</div>
    </div>
  );
}
