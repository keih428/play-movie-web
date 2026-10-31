import type { NextConfig } from "next";

// サイトの URL は utvb.vercel.app(2026-10-31 から)。部内ポータルとしての利用がメインになったため、
// 動画ビューアのころの play-movie-web.vercel.app から移した。古い URL は、パスとクエリをそのままに新しい URL へ送る。
const CANONICAL_HOST = "utvb.vercel.app";
const LEGACY_HOSTS = ["play-movie-web.vercel.app"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite"],
  async redirects() {
    return LEGACY_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `https://${CANONICAL_HOST}/:path*`,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        // 監督向けの予定表の共有リンク(/t/<チーム>/s/<token>)。検索に載せず、リンク先に token を渡さない。
        source: "/t/:teamSlug/s/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
