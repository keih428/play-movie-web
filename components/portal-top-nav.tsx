"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildTeamLoginPath,
  buildTeamMembersPath,
  buildTeamRootPath,
  buildTeamTrainingPath,
  buildTeamTrainingRecordsPath,
} from "@/lib/domain/team";

export function PortalTopNav({ teamSlug }: { teamSlug: string }) {
  const pathname = usePathname();
  // ログインの前は、部内ページへのリンクは出さない。
  const links = [
    ...(pathname === buildTeamLoginPath(teamSlug)
      ? []
      : [
          { href: buildTeamTrainingPath(teamSlug), label: "メニュー" },
          { href: buildTeamTrainingRecordsPath(teamSlug), label: "みんなの記録" },
          { href: buildTeamMembersPath(teamSlug), label: "名簿" },
        ]),
    { href: buildTeamRootPath(teamSlug), label: "試合" },
  ];

  // 「名簿」は、その下の「ログインの記録」を開いているときも選ばれた表示にする。
  const membersPath = buildTeamMembersPath(teamSlug);
  const isCurrent = (href: string) =>
    pathname === href || (href === membersPath && pathname.startsWith(`${membersPath}/`));

  return (
    <header className="tp-top">
      <Link className="tp-brand" href={buildTeamTrainingPath(teamSlug)}>
        鉄壁
      </Link>
      <nav aria-label="部内ページ">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isCurrent(link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
