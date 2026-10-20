import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteCard } from "@/components/note-card";
import { PracticeDayForm } from "@/components/practice-day-form";
import {
  NOTE_FEEDS,
  NOTE_FEED_LABELS,
  addDaysToDate,
  formatNoteDate,
  type NoteFeed,
} from "@/lib/domain/notes";
import { canAdminister, canExportNotes, getMemberGroup, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import {
  getUnreadCounts,
  listComments,
  listNotes,
  listPracticeDayOverrides,
} from "@/lib/server/portal-note-store";
import { getPracticeSchedule } from "@/lib/server/portal-calendar";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    feed?: string;
  }>;
};

export const dynamic = "force-dynamic";

const FEED_LIMIT = 60;

/** バレーノート:みんなのノートを読む。上に、自分がまだ書いていない練習日を出す。 */
export default async function TeamNotesPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamNotesPath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const today = getTodayInJapan();
  const canWrite = Boolean(current.position);

  // 開いたときは自分のまとまり(OH と OP は同じ「サイド」)。スタッフは全員から。
  const { feed: requestedFeed } = await searchParams;
  const ownFeed: NoteFeed = getMemberGroup(current.position) ?? "all";
  const feed = NOTE_FEEDS.includes(requestedFeed as NoteFeed) ? (requestedFeed as NoteFeed) : ownFeed;

  const [notes, overrides, schedule, unreadCounts, recentOwnNotes] = await Promise.all([
    listNotes(teamSlug, { group: feed === "all" ? undefined : feed, limit: FEED_LIMIT }),
    listPracticeDayOverrides(teamSlug),
    getPracticeSchedule(teamSlug, addDaysToDate(today, -7), today),
    getUnreadCounts(current.id),
    canWrite ? listNotes(teamSlug, { memberId: current.id, from: addDaysToDate(today, -7) }) : [],
  ]);
  const unreadTotal = Object.values(unreadCounts).reduce((total, count) => total + count, 0);
  // 一覧の中でコメントを開けるように、並べるノートのコメントをまとめて読む。
  const comments = await listComments(notes.map((note) => note.id));

  // まだ書いていない練習日は、今日の練習と、その前の直近1回の練習だけ(新しい順)。
  // 欠席した日がずっと残り続けないように、それより前の日は出さない(けーいちの決定、2026-10-20)。
  const writtenDates = new Set(recentOwnNotes.map((note) => note.practiceDate));
  const practiceDates = [...schedule.dates].sort();
  const latestPast = practiceDates.filter((date) => date < today).pop();
  const missingDates = canWrite
    ? [practiceDates.includes(today) ? today : null, latestPast ?? null].filter(
        (date): date is string => date !== null && !writtenDates.has(date),
      )
    : [];

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">練習のたびに、気付いたことを残す</span>
        <h1>バレーノート</h1>
        <div className="tp-actions">
          {canWrite ? (
            <Link className="tp-button tp-ghost" href={`${basePath}/mine`}>
              自分のノート
              {unreadTotal > 0 ? <span className="tp-unread">新着 {unreadTotal}</span> : null}
            </Link>
          ) : null}
          {canExportNotes(current) ? (
            <Link className="tp-button tp-ghost" href={`${basePath}/print`}>
              月ごとにまとめる(PDF)
            </Link>
          ) : null}
        </div>
      </header>

      {missingDates.length > 0 ? (
        <section className="tp-section">
          <h2>まだ書いていない練習日</h2>
          <div className="tp-actions">
            {missingDates.map((date, index) => (
              <Link
                key={date}
                className={index === 0 ? "tp-button" : "tp-button tp-ghost"}
                href={`${basePath}/write?date=${date}`}
              >
                {date === today ? "今日" : formatNoteDate(date)}のノートを書く
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="tp-bar" role="region" aria-label="まとまりの切り替え">
        <nav className="tp-seg tp-days" aria-label="まとまり">
          {NOTE_FEEDS.map((entry) => (
            <Link
              key={entry}
              href={`${basePath}?feed=${entry}`}
              aria-current={entry === feed ? "true" : undefined}
            >
              {NOTE_FEED_LABELS[entry]}
            </Link>
          ))}
        </nav>
      </div>

      <section className="tp-section">
        {notes.length === 0 ? (
          <p className="tp-small tp-muted">まだノートがありません。</p>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              href={`${basePath}/${note.id}`}
              note={note}
              comments={comments.filter((comment) => comment.noteId === note.id)}
              isMine={note.memberId === current.id}
              teamSlug={teamSlug}
              unread={unreadCounts[note.id]}
            />
          ))
        )}
        {notes.length === FEED_LIMIT ? (
          <p className="tp-small tp-muted">新しいものから {FEED_LIMIT} 件までを出しています。</p>
        ) : null}
      </section>

      {canAdminister(current) ? (
        <footer className="tp-footer">
          {schedule.source === "calendar" ? (
            <p>練習日は、部の Google カレンダーから取っています(「オフ」以外の予定がある日)。</p>
          ) : (
            <details>
              <summary>練習日を変える(トレーニング担当だけ)</summary>
              <PracticeDayForm overrides={overrides} teamSlug={teamSlug} />
            </details>
          )}
        </footer>
      ) : null}
    </>
  );
}
