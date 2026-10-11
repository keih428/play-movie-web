"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildTeamMembersPath,
  buildTeamRootPath,
  buildTeamTrainingPath,
  buildTeamTrainingRecordsPath,
} from "@/lib/domain/team";

export function TrainingTopNav({ teamSlug }: { teamSlug: string }) {
  const pathname = usePathname();
  const links = [
    { href: buildTeamTrainingPath(teamSlug), label: "メニュー" },
    { href: buildTeamTrainingRecordsPath(teamSlug), label: "みんなの記録" },
    { href: buildTeamMembersPath(teamSlug), label: "名簿" },
    { href: buildTeamRootPath(teamSlug), label: "試合" },
  ];

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
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
