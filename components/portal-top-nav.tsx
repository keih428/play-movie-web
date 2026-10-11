"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  buildTeamLoginPath,
  buildTeamMembersPath,
  buildTeamNotesPath,
  buildTeamRootPath,
  buildTeamTrainingPath,
  buildTeamTrainingPlanPath,
  buildTeamTrainingRecordsPath,
} from "@/lib/domain/team";

type PortalTopNavProps = {
  initialTango: boolean;
  teamSlug: string;
  // 自分のノートに付いた、まだ読んでいないコメントの数。
  unreadNotes: number;
};

const MODE_COOKIE = "portal_mode";
const MODE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function PortalTopNav({ initialTango, teamSlug, unreadNotes }: PortalTopNavProps) {
  const pathname = usePathname();
  const [isTango, setIsTango] = useState(initialTango);

  // 見た目は CSS だけで切り替わるので、枠の属性を書き換えてクッキーに覚えさせるだけでよい。
  function toggleMode() {
    const next = !isTango;
    setIsTango(next);
    document.querySelector<HTMLElement>(".tp")?.setAttribute("data-mode", next ? "tango" : "std");
    document.cookie = `${MODE_COOKIE}=${next ? "tango" : "std"}; path=/; max-age=${MODE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  }

  // ログインの前は、部内ページへのリンクは出さない。
  const links = [
    ...(pathname === buildTeamLoginPath(teamSlug)
      ? []
      : [
          { href: buildTeamTrainingPath(teamSlug), label: "メニュー" },
          { href: buildTeamNotesPath(teamSlug), label: "ノート", badge: unreadNotes },
          { href: buildTeamTrainingRecordsPath(teamSlug), label: "記録" },
          { href: buildTeamTrainingPlanPath(teamSlug), label: "年間" },
          { href: buildTeamMembersPath(teamSlug), label: "名簿" },
        ]),
    { href: buildTeamRootPath(teamSlug), label: "試合" },
  ];

  // 「名簿」「ノート」は、その下のページを開いているときも選ばれた表示にする。
  const sectionPaths = [buildTeamMembersPath(teamSlug), buildTeamNotesPath(teamSlug)];
  const isCurrent = (href: string) =>
    pathname === href || (sectionPaths.includes(href) && pathname.startsWith(`${href}/`));

  return (
    <header className="tp-top">
      <button
        type="button"
        role="switch"
        aria-checked={isTango}
        className="tp-mode"
        onClick={toggleMode}
      >
        <span className="tp-mode-track" aria-hidden="true">
          <i />
        </span>
        鉄壁
      </button>
      <nav aria-label="部内ページ">
        {links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={isCurrent(link.href) ? "page" : undefined}>
            {link.label}
            {"badge" in link && link.badge ? <span className="tp-nav-badge">{link.badge}</span> : null}
          </Link>
        ))}
      </nav>
    </header>
  );
}
