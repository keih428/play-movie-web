import type { Metadata } from "next";
import { SiteHeaderNav } from "@/components/site-header-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "バレーボール 試合ビューア",
  description: "VolleyStation の試合データと動画を同期する分析アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <SiteHeaderNav />
        </header>
        {children}
      </body>
    </html>
  );
}
