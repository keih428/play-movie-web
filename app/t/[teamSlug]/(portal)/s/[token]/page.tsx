import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScheduleView, type ScheduleQuery } from "@/components/schedule-view";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamScheduleSharePath } from "@/lib/domain/team";
import { isValidShareToken } from "@/lib/server/portal-share-link-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
    token: string;
  }>;
  searchParams: Promise<ScheduleQuery>;
};

export const dynamic = "force-dynamic";

// 検索に載せない。サーバーの返事にも同じ印を付けている(next.config.ts)。
export const metadata: Metadata = {
  title: "東大バレー部 予定表",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

/**
 * 監督など、ログインしない人向けの予定表(2026-10-31 から)。中身は部内ページの予定表と同じで、読むだけ。
 * リンクの token が今のものと違えば(作り直した・止めた)、ページがないことにする。
 */
export default async function SharedSchedulePage({ params, searchParams }: PageProps) {
  const { teamSlug, token } = await params;
  if (!isPortalTeam(teamSlug) || !(await isValidShareToken(teamSlug, "schedule", token))) {
    notFound();
  }

  return (
    <ScheduleView
      teamSlug={teamSlug}
      basePath={buildTeamScheduleSharePath(teamSlug, token)}
      query={await searchParams}
      showSource={false}
      eyebrow="東大バレー部 練習・試合の予定"
    />
  );
}
