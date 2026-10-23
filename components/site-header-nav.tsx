"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { isPortalTeam } from "@/lib/domain/portal";
import {
  buildTeamAnalysisPath,
  buildTeamAttendancePath,
  buildTeamDataLibraryPath,
  buildTeamHomePath,
  buildTeamLoginPath,
  buildTeamNotesPath,
  buildTeamRootPath,
  buildTeamMyPlaysPath,
  buildTeamSchedulePath,
  buildTeamStaffSettingsPath,
  buildTeamTrainingPath,
  buildTeamVideosPath,
  buildTeamWorkspacesPath,
} from "@/lib/domain/team";

function getTeamSlugFromParams(params: ReturnType<typeof useParams>): string | undefined {
  const value = params?.teamSlug;
  return typeof value === "string" ? value : undefined;
}

type SiteHeaderNavProps = {
  portalUser: { name: string; teamSlug: string } | null;
  // 自分のノートに付いた、まだ読んでいないコメントの数(ログインしていなければ 0)。
  unreadNotes: number;
};

// 部内ページ(この下のパス)では、試合のメニューを出さない。
const PORTAL_SECTIONS = ["home", "manual", "training", "notes", "attendance", "schedule", "myplays", "members", "login"];

function getMatchLinks(teamSlug: string) {
  return [
    { href: buildTeamWorkspacesPath(teamSlug), label: "試合一覧", shortLabel: "試合一覧" },
    { href: buildTeamAnalysisPath(teamSlug), label: "総合分析", shortLabel: "総合分析" },
    { href: buildTeamVideosPath(teamSlug), label: "動画ライブラリ", shortLabel: "動画" },
    { href: buildTeamDataLibraryPath(teamSlug), label: "試合データ管理", shortLabel: "データ" },
    { href: buildTeamStaffSettingsPath(teamSlug), label: "設定", shortLabel: "設定" },
  ];
}

/**
 * 部のチーム(utvb)のページの上のバー。部内ページでも試合のページでも同じものを出す(部員の声、2026-10-20:
 * 「ページによってメニューや UI が変わるのが混乱する」)。メインは ホーム・トレ録・ノート・出欠・予定・試合 の6つで、
 * それ以外のページ(年間・名簿・試合など)はホームから行く。試合のページでは、その下に試合のメニューを出す。
 */
function TeamHeader({
  teamSlug,
  loggedIn,
  unreadNotes,
}: {
  teamSlug: string;
  loggedIn: boolean;
  unreadNotes: number;
}) {
  const pathname = usePathname();
  const root = buildTeamRootPath(teamSlug);
  const section = pathname.startsWith(`${root}/`) ? pathname.slice(root.length + 1).split("/")[0] : "";
  const isPortalPage = PORTAL_SECTIONS.includes(section);
  const within = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const mainLinks = loggedIn
    ? [
        { href: buildTeamHomePath(teamSlug), label: "ホーム" },
        { href: buildTeamTrainingPath(teamSlug), label: "トレ録" },
        { href: buildTeamNotesPath(teamSlug), label: "ノート", badge: unreadNotes },
        { href: buildTeamAttendancePath(teamSlug), label: "出欠" },
        { href: buildTeamSchedulePath(teamSlug), label: "予定" },
        // 自分のプレーの映像(けーいちの決定、2026-10-24)。試合ビューアの「試合一覧」とは別。
        { href: buildTeamMyPlaysPath(teamSlug), label: "試合" },
      ]
    : pathname === buildTeamLoginPath(teamSlug)
      ? []
      : [{ href: buildTeamLoginPath(teamSlug), label: "ログイン" }];

  return (
    <header className="team-header">
      <div className="team-header-inner">
        <Link
          className="team-brand"
          href={loggedIn ? buildTeamHomePath(teamSlug) : root}
          aria-label="東大バレー部 ホーム"
        >
          {/* 東大のロゴ(web アプリのアイコンと同じ)+ UTVB(けーいちの決定、2026-10-21)。 */}
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={28}
            height={28}
            className="team-brand-mark"
            sizes="28px"
            priority
          />
          <span className="team-brand-text">UTVB</span>
        </Link>
        <nav className="team-nav" aria-label="部内ページ">
          {mainLinks.map((link) => (
            <Link key={link.href} href={link.href} aria-current={within(link.href) ? "page" : undefined}>
              {link.label}
              {"badge" in link && link.badge ? <span className="team-nav-badge">{link.badge}</span> : null}
            </Link>
          ))}
        </nav>
      </div>
      {isPortalPage ? null : (
        <nav className="team-subnav" aria-label="試合">
          <div className="team-subnav-inner">
            {getMatchLinks(teamSlug).map((link) => (
              <Link key={link.href} href={link.href} aria-current={within(link.href) ? "page" : undefined}>
                <span className="site-nav-label">{link.label}</span>
                <span className="site-nav-label-short">{link.shortLabel}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteHeaderNav({ portalUser, unreadNotes }: SiteHeaderNavProps) {
  const params = useParams();
  const pathname = usePathname();
  const teamSlug = getTeamSlugFromParams(params);

  if (teamSlug && isPortalTeam(teamSlug)) {
    const loggedIn = portalUser?.teamSlug === teamSlug;
    return <TeamHeader teamSlug={teamSlug} loggedIn={loggedIn} unreadNotes={loggedIn ? unreadNotes : 0} />;
  }

  // 部のチーム以外(ほかのチームの試合ビューア、チームを選ぶ前のページ)は、これまでどおり。
  // 試合の中のページ(/workspaces/<id> など)でも、親の項目を選ばれた表示にする。
  const isCurrent = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const links = teamSlug
    ? getMatchLinks(teamSlug)
    : [
        { href: "/", label: "ホーム", shortLabel: "ホーム" },
        { href: "/workspaces", label: "試合一覧", shortLabel: "試合一覧" },
        { href: "/videos", label: "動画ライブラリ", shortLabel: "動画" },
        { href: "/staff/data-library", label: "試合データ管理", shortLabel: "データ" },
        { href: "/staff/settings", label: "設定", shortLabel: "設定" },
      ];

  const brandHref = teamSlug ? buildTeamRootPath(teamSlug) : "/";

  return (
    <header className="site-header">
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
          <span className="site-brand-text">バレーボール 試合ビューア</span>
        </Link>
        <nav className="site-nav" aria-label="Global">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="site-nav-link"
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              <span className="site-nav-label">{link.label}</span>
              <span className="site-nav-label-short">{link.shortLabel}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
