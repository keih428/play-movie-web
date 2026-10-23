import Link from "next/link";
import { notFound } from "next/navigation";
import { MyPlaysClient } from "@/components/my-plays-client";
import { normalizeShirtNumber } from "@/lib/domain/my-plays";
import { formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamMyPlaysPath, buildWorkspacePath } from "@/lib/domain/team";
import { listMemberMatches } from "@/lib/server/my-plays";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ match?: string }>;
};

export const dynamic = "force-dynamic";

/**
 * 上のメニューの「試合」(マイプレー、2026-10-24 から)。開くと、直近の試合の自分のプレーがすぐ出る。
 * 見られるのは自分の分だけ。前の試合は、上の選択から選ぶ。
 */
export default async function MyPlaysPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const basePath = buildTeamMyPlaysPath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const number = normalizeShirtNumber(current.number);

  const header = (
    <header className="tp-hero">
      <span className="tp-eyebrow">自分のプレーの映像</span>
      <h1>試合</h1>
    </header>
  );

  if (!number) {
    return (
      <>
        {header}
        <p className="tp-message">背番号が数字の部員だけが使えます(試合のデータは背番号で選手を見分けるため)。</p>
      </>
    );
  }

  const matches = await listMemberMatches(teamSlug, number);
  if (matches.length === 0) {
    return (
      <>
        {header}
        <p className="tp-message">まだ、背番号 {number} のプレーが入った試合はありません。</p>
      </>
    );
  }

  const { match: requested } = await searchParams;
  const selected = matches.find((entry) => entry.workspaceId === requested) ?? matches[0];
  const options = matches.map((entry) => ({
    workspaceId: entry.workspaceId,
    label: `${entry.date ? formatNoteDate(entry.date.slice(0, 10)) : "日付なし"} vs ${entry.opponent}(${entry.setScore.own}-${entry.setScore.opponent})`,
  }));

  return (
    <>
      {header}
      <MyPlaysClient
        key={selected.workspaceId}
        basePath={basePath}
        options={options}
        selectedId={selected.workspaceId}
        isLatest={selected === matches[0]}
        match={selected.match}
        settings={selected.record.settings}
        side={selected.side}
        number={number}
        opponent={selected.opponent}
        setScore={selected.setScore}
      />
      <p className="tp-small tp-muted">
        チーム全体の映像と分析は{" "}
        <Link href={buildWorkspacePath({ workspaceId: selected.workspaceId, teamSlug })}>試合ビューア</Link> で見られます。
      </p>
    </>
  );
}
