"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  buildTeamAnalysisPath,
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
        { href: buildTeamWorkspacesPath(teamSlug), label: "試合一覧", shortLabel: "試合一覧" },
        { href: buildTeamAnalysisPath(teamSlug), label: "総合分析", shortLabel: "総合分析" },
        { href: buildTeamVideosPath(teamSlug), label: "動画ライブラリ", shortLabel: "動画" },
        { href: buildTeamDataLibraryPath(teamSlug), label: "試合データ管理", shortLabel: "データ" },
        { href: buildTeamStaffSettingsPath(teamSlug), label: "設定", shortLabel: "設定" },
      ]
    : [
        { href: "/", label: "ホーム", shortLabel: "ホーム" },
        { href: "/workspaces", label: "試合一覧", shortLabel: "試合一覧" },
        { href: "/videos", label: "動画ライブラリ", shortLabel: "動画" },
        { href: "/staff/data-library", label: "試合データ管理", shortLabel: "データ" },
        { href: "/staff/settings", label: "設定", shortLabel: "設定" },
      ];

  const brandHref = teamSlug ? buildTeamRootPath(teamSlug) : "/";

  return (
    <div className="site-header-inner">
      <Link className="site-brand" href={brandHref}>
        <Image
          src="/logo-top.png"
          alt=""
          width={150}
          height={36}
          className="site-brand-logo"
          sizes="(max-width: 720px) 130px, 150px"
          priority
        />
        バレーボール 試合ビューア
      </Link>
      <nav className="site-nav" aria-label="Global">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="site-nav-link">
            <span className="site-nav-label">{link.label}</span>
            <span className="site-nav-label-short">{link.shortLabel}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
