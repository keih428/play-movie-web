import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NoteEditor } from "@/components/note-editor";
import {
  formatNoteDate,
  formatRelativeNoteDate,
  getLastNoteDate,
  isIsoDate,
} from "@/lib/domain/notes";
import { findOwnSide, getOwnSetScore, normalizeShirtNumber } from "@/lib/domain/my-plays";
import { buildMatchNoteTemplate, buildMyStats } from "@/lib/domain/my-stats";
import { isPortalTeam, type MemberPosition } from "@/lib/domain/portal";
import { getWorkspacePrimaryMatch } from "@/lib/domain/summary";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { getNoteByDate } from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";
import { getSavedWorkspace } from "@/lib/server/workspace-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    date?: string;
    // 「試合」のページから来たとき:その試合の自分の数字を入れた下書きで始める(2026-10-24 から)。
    match?: string;
  }>;
};

/** 試合の振り返りの下書き。試合が見つからない・自分のプレーがない・チームが違うときは空。 */
async function buildMatchDraft(
  workspaceId: string,
  teamSlug: string,
  number: string | null,
  position: MemberPosition | null,
) {
  if (!number) {
    return "";
  }
  const record = await getSavedWorkspace(workspaceId);
  const match = record && record.teamSlug === teamSlug ? getWorkspacePrimaryMatch(record) : undefined;
  const side = match ? findOwnSide(match) : undefined;
  if (!match || !side) {
    return "";
  }
  const sections = buildMyStats({
    matches: [{ match, side }],
    number,
    position,
  });
  if (sections.length === 0) {
    return "";
  }
  const score = getOwnSetScore(match, side);
  const opponent = side === "home" ? match.teams.away.name : match.teams.home.name;
  const date = match.startDate ? formatNoteDate(match.startDate.slice(0, 10)) : "";
  return buildMatchNoteTemplate({ title: `${date} vs ${opponent}(${score.own}-${score.opponent})`, sections });
}

export const dynamic = "force-dynamic";

/** その日のノートを書く。もう書いてあれば、その続きを直す。 */
export default async function TeamNoteWritePage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamNotesPath(teamSlug);
  const today = getTodayInJapan();
  const { date: requestedDate, match: matchId } = await searchParams;
  const date =
    isIsoDate(requestedDate) && requestedDate <= getLastNoteDate(today) ? requestedDate : today;
  const current = await requireMember(teamSlug, `${basePath}/write?date=${date}`);
  if (!current.position) {
    redirect(basePath);
  }

  const existing = await getNoteByDate(current.id, date);
  const matchDraft =
    !existing?.body.trim() && matchId
      ? await buildMatchDraft(matchId, teamSlug, normalizeShirtNumber(current.number), current.position)
      : "";

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">
          {current.displayName} ・ {current.position}
        </span>
        <h1>{formatRelativeNoteDate(date, today)}のノート</h1>
        <p className="tp-small tp-muted">
          {date.slice(0, 4)}年 {formatNoteDate(date)}
          {existing?.body.trim() ? " ・ 書いてあるノートを編集しています" : ""}
        </p>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={`${basePath}/mine`}>
            やめて戻る
          </Link>
        </div>
      </header>
      <NoteEditor
        date={date}
        initialBody={existing?.body.trim() ? existing.body : matchDraft}
        initialRequest={existing?.request ?? ""}
        initialTeamMessage={existing?.teamMessage ?? ""}
        teamSlug={teamSlug}
      />
    </>
  );
}
