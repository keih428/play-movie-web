import type { Metadata } from "next";
import { SiteHeaderNav } from "@/components/site-header-nav";
import { getSession } from "@/lib/server/portal-session";
import "./globals.css";

export const metadata: Metadata = {
  title: "バレーボール 試合ビューア",
  description: "VolleyStation の試合データと動画を同期する分析アプリ",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
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
