import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Play Movie Web",
  description: "VolleyStation の試合データと動画を同期する分析アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
