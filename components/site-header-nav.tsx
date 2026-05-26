"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  buildTeamDataLibraryPath,
  buildTeamRootPath,
  buildTeamStaffSettingsPath,
  buildTeamVideosPath,
  buildTeamWorkspacesPath,
} from "@/lib/domain/team";

function getTeamSlugFromParams(params: ReturnType<typeof useParams>): string | undefined {
  const value = params?.teamSlug;
  return typeof value === "string" ? value : undefined;
}

export function SiteHeaderNav() {
  const params = useParams();
  const teamSlug = getTeamSlugFromParams(params);

  const links = teamSlug
    ? [
        { href: buildTeamRootPath(teamSlug), label: "ホーム" },
        { href: buildTeamVideosPath(teamSlug), label: "動画ライブラリ" },
        { href: buildTeamDataLibraryPath(teamSlug), label: "試合データ管理" },
        { href: buildTeamWorkspacesPath(teamSlug), label: "試合一覧" },
        { href: buildTeamStaffSettingsPath(teamSlug), label: "スタッフ設定" },
      ]
    : [
        { href: "/", label: "ホーム" },
        { href: "/videos", label: "動画ライブラリ" },
        { href: "/staff/data-library", label: "試合データ管理" },
        { href: "/workspaces", label: "試合一覧" },
        { href: "/staff/settings", label: "スタッフ設定" },
      ];

  const brandHref = teamSlug ? buildTeamRootPath(teamSlug) : "/";

  return (
    <div className="site-header-inner">
      <Link className="site-brand" href={brandHref}>
        バレーボール 試合ビューア
      </Link>
      <nav className="site-nav" aria-label="Global">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
