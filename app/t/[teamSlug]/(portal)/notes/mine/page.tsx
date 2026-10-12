import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { describePracticeEvents } from "@/lib/domain/calendar";
import { addDaysToDate, formatNoteDate, getLastNoteDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { getPracticeSchedule } from "@/lib/server/portal-calendar";
import { getUnreadCounts, listNotes } from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    weeks?: string;
  }>;
};

export const dynamic = "force-dynamic";

// はじめは8週間ぶん。「さらに前を見る」で8週間ずつさかのぼる。
const WEEKS_STEP = 8;
const WEEKS_MAX = 520;

/** 自分のノート:練習日ごとに枠が並び、書いていない日がひと目で分かる。 */
export default async function TeamMyNotesPage({ params, searchParams }: PageProps) {
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
  const lastDate = getLastNoteDate(today);
  const requestedWeeks = Number.parseInt((await searchParams).weeks ?? "", 10);
  const weeks = Number.isFinite(requestedWeeks)
    ? Math.min(WEEKS_MAX, Math.max(WEEKS_STEP, requestedWeeks))
    : WEEKS_STEP;
  const from = addDaysToDate(today, -7 * weeks);
  const [notes, schedule, unreadCounts] = await Promise.all([
    listNotes(teamSlug, { memberId: current.id, from }),
    getPracticeSchedule(teamSlug, from, lastDate),
    getUnreadCounts(current.id),
  ]);
  const noteByDate = new Map(notes.map((note) => [note.practiceDate, note]));

  // 練習日の枠に、練習日ではない日に書いたノートも混ぜて、新しい順に並べる。
  const dates = [...new Set([...schedule.dates, ...noteByDate.keys()])].sort(
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
                <span className="tp-when">
                  {formatNoteDate(date)}
                  {date === lastDate ? <small> 明日</small> : date === today ? <small> 今日</small> : null}
                </span>
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
                    {schedule.eventsByDate[date]
                      ? `${describePracticeEvents(schedule.eventsByDate[date])}:`
                      : ""}
                    まだ書いていない → 書く
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <p className="tp-small tp-muted">
          明日の分から、{weeks} 週間前までを出しています。
          {weeks < WEEKS_MAX ? (
            <>
              {" "}
              <Link className="tp-link" href={`${basePath}/mine?weeks=${weeks + WEEKS_STEP}`} scroll={false}>
                さらに前を見る
              </Link>
            </>
          ) : null}
        </p>
      </section>

      <section className="tp-section">
        <h2>日付を選んで書く</h2>
        <p className="tp-small tp-muted">
          過去のどの日でも、先は明日の分まで書けます。予定のない日や、ずっと前の日はここから。
        </p>
        <form className="tp-inputs" method="get" action={`${basePath}/write`}>
          <div className="tp-field">
            <label htmlFor="note-date">日付</label>
            <input id="note-date" type="date" name="date" max={lastDate} defaultValue={today} required />
          </div>
          <div className="tp-field">
            <span>&nbsp;</span>
            <button className="tp-button tp-ghost" type="submit">
              この日のノートを書く
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
