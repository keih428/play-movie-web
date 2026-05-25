import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "東大バレー部 試合ビューア",
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
          <div className="site-header-inner">
            <Link className="site-brand" href="/">
              東大バレー部 試合ビューア
            </Link>
            <nav className="site-nav" aria-label="Global">
              <Link href="/">ホーム</Link>
              <Link href="/videos">動画ライブラリ</Link>
              <Link href="/workspaces">試合一覧</Link>
              <Link href="/staff/settings">スタッフ設定</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
