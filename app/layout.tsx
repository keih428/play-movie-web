import type { Metadata } from "next";
import { SiteHeaderNav } from "@/components/site-header-nav";
import { getSession } from "@/lib/server/portal-session";
import "./globals.css";

export const metadata: Metadata = {
  title: "バレーボール 試合ビューア",
  description: "VolleyStation の試合データと動画を同期する分析アプリ",
  // iPhone の「ホーム画面に追加」で、URL の欄がない全画面で開く(Android は app/manifest.ts)。
  appleWebApp: {
    capable: true,
    title: "東大バレー部",
    statusBarStyle: "default",
  },
};

// 配布版(鉄壁トレーニング)と同じ文字。日本語の書体はビルドに取り込むと数百ファイルになるので、
// Google Fonts から、表示に要る分だけをブラウザに読ませる。
const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500;600&family=Shippori+Mincho+B1:wght@600;800&family=Noto+Serif:ital,wght@0,400;0,700;1,400&display=swap";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_STYLESHEET} precedence="default" />
        <header className="site-header">
          <SiteHeaderNav
            portalUser={session ? { name: session.name, teamSlug: session.teamSlug } : null}
          />
        </header>
        {children}
      </body>
    </html>
  );
}
