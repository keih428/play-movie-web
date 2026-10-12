import type { MetadataRoute } from "next";
import { PORTAL_TEAM_SLUGS } from "@/lib/domain/portal";
import { buildTeamTrainingPath } from "@/lib/domain/team";

// スマホの「ホーム画面に追加」で、URL の欄がない全画面のアプリとして開くための設定。
// ホーム画面から開いたときは、部内ページ(トレーニングのメニュー)から始める。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "東大バレー部 部内ページ",
    short_name: "東大バレー部",
    description: "トレーニングの記録・バレーノート・出欠と、試合ビューア",
    start_url: buildTeamTrainingPath(PORTAL_TEAM_SLUGS[0]),
    scope: "/",
    display: "standalone",
    background_color: "#f1f3f6",
    theme_color: "#f1f3f6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
