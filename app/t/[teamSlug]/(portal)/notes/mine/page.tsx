import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addDaysToDate, formatNoteDate, listPracticeDates } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import {
  getUnreadCounts,
  listNotes,
  listPracticeDayOverrides,
} from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

const WEEKS_SHOWN = 8;

/** 自分のノート:練習日ごとに枠が並び、書いていない日がひと目で分かる。 */
export default async function TeamMyNotesPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamNotesPath(teamSlug);
  const current = await requireMember(teamSlug, `${basePath}/mine`);
  if (!current.position) {
    redirect(basePath);
  }

  const today = getTodayInJapan();
  const from = addDaysToDate(today, -7 * WEEKS_SHOWN);
  const [notes, overrides, unreadCounts] = await Promise.all([
    listNotes(teamSlug, { memberId: current.id, from }),
    listPracticeDayOverrides(teamSlug),
    getUnreadCounts(current.id),
  ]);
  const noteByDate = new Map(notes.map((note) => [note.practiceDate, note]));

  // 練習日の枠に、練習日ではない日に書いたノートも混ぜて、新しい順に並べる。
  const dates = [...new Set([...listPracticeDates(from, today, overrides), ...noteByDate.keys()])].sort(
    (left, right) => right.localeCompare(left),
  );
  // いちばん古いノートより前の「書いていない日」は出さない(使い始める前の日を責めないため)。
  const oldestWritten = notes.length > 0 ? notes[notes.length - 1].practiceDate : today;
  const shownDates = dates.filter((date) => date >= addDaysToDate(oldestWritten, -7));

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">
          {current.name} ・ {current.position}
        </span>
        <h1>自分のノート</h1>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={basePath}>
            みんなのノートへ
          </Link>
        </div>
      </header>

      <section className="tp-section">
        <ol className="tp-slots">
          {shownDates.map((date) => {
            const note = noteByDate.get(date);
            const unread = note ? (unreadCounts[note.id] ?? 0) : 0;
            return (
              <li key={date}>
                <span className="tp-when">{formatNoteDate(date)}</span>
                {note ? (
                  <Link className="tp-slot-body" href={`${basePath}/${note.id}`}>
                    <span className="tp-note-clamp tp-note-clamp-2">{note.body}</span>
                    <span className="tp-small tp-muted">
                      コメント {note.commentCount}件
                      {unread > 0 ? <span className="tp-unread">新着 {unread}</span> : null}
                    </span>
                  </Link>
                ) : (
                  <Link className="tp-slot-body tp-slot-empty" href={`${basePath}/write?date=${date}`}>
                    まだ書いていない → 書く
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <p className="tp-small tp-muted">
          新しいほうから {WEEKS_SHOWN} 週間ぶん。練習のない日に書きたいときは、
          <Link className="tp-link" href={`${basePath}/write?date=${today}`}>
            今日の日付で書く
          </Link>
          。
        </p>
      </section>
    </>
  );
}
