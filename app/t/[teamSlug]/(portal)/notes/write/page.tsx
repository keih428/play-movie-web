import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NoteEditor } from "@/components/note-editor";
import {
  formatNoteDate,
  formatRelativeNoteDate,
  getLastNoteDate,
  isIsoDate,
} from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { getNoteByDate } from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    date?: string;
  }>;
};

export const dynamic = "force-dynamic";

/** その日のノートを書く。もう書いてあれば、その続きを直す。 */
export default async function TeamNoteWritePage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamNotesPath(teamSlug);
  const today = getTodayInJapan();
  const { date: requestedDate } = await searchParams;
  const date =
    isIsoDate(requestedDate) && requestedDate <= getLastNoteDate(today) ? requestedDate : today;
  const current = await requireMember(teamSlug, `${basePath}/write?date=${date}`);
  if (!current.position) {
    redirect(basePath);
  }

  const existing = await getNoteByDate(current.id, date);

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">
          {current.displayName} ・ {current.position}
        </span>
        <h1>{formatRelativeNoteDate(date, today)}のノート</h1>
        <p className="tp-small tp-muted">
          {date.slice(0, 4)}年 {formatNoteDate(date)}
          {existing ? " ・ 書いてあるノートを編集しています" : ""}
        </p>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={`${basePath}/mine`}>
            やめて戻る
          </Link>
        </div>
      </header>
      <NoteEditor
        date={date}
        initialBody={existing?.body ?? ""}
        initialRequest={existing?.request ?? ""}
        teamSlug={teamSlug}
      />
    </>
  );
}
