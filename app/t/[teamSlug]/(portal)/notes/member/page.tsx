import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NoteCard } from "@/components/note-card";
import { NoteComments } from "@/components/note-comments";
import { describePracticeEvents } from "@/lib/domain/calendar";
import { formatMilestoneMonth, monthOf } from "@/lib/domain/milestones";
import { addDaysToDate, formatNoteDate, getLastNoteDate, isNoteWritten } from "@/lib/domain/notes";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamMilestonesPath, buildTeamNotesPath } from "@/lib/domain/team";
import { getPracticeSchedule } from "@/lib/server/portal-calendar";
import { getMember } from "@/lib/server/portal-member-store";
import { listMemberMilestones } from "@/lib/server/portal-milestone-store";
import { listComments, listNotes } from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ id?: string; weeks?: string }>;
};

export const dynamic = "force-dynamic";

// はじめは4週間ぶん。「さらに前を見る」で4週間ずつさかのぼる。
const WEEKS_STEP = 4;
const WEEKS_MAX = 104;

/**
 * 部員のノート(練習日ごと)。まだ書いていない日にもコメントを付けられる(けーいちの決定、2026-10-26)。
 * 最初のコメントで本文が空のノートができ、本人があとで書くと、コメントはそのまま残る。
 */
export default async function TeamMemberNotesPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const basePath = buildTeamNotesPath(teamSlug);
  const { id, weeks: requestedWeeks } = await searchParams;
  const current = await requireMember(teamSlug, `${basePath}/member?id=${id ?? ""}`);
  if (id === current.id) {
    redirect(`${basePath}/mine`);
  }
  const target = id ? await getMember(id) : null;
  if (!target || target.teamSlug !== teamSlug || !target.position) {
    notFound();
  }

  const today = getTodayInJapan();
  const lastDate = getLastNoteDate(today);
  const parsedWeeks = Number.parseInt(requestedWeeks ?? "", 10);
  const weeks = Number.isFinite(parsedWeeks) ? Math.min(WEEKS_MAX, Math.max(WEEKS_STEP, parsedWeeks)) : WEEKS_STEP;
  const from = addDaysToDate(today, -7 * weeks);
  const month = monthOf(today);
  const [notes, schedule, targetMilestones] = await Promise.all([
    listNotes(teamSlug, { memberId: target.id, from }),
    getPracticeSchedule(teamSlug, from, today),
    listMemberMilestones(target.id),
  ]);
  // ノートの月ごとのマイルストーン(名前の横に出す)。
  const milestoneByMonth = new Map(targetMilestones.map((milestone) => [milestone.month, milestone.body]));
  const currentMilestone = milestoneByMonth.get(month) ?? null;
  const comments = await listComments(notes.map((note) => note.id));
  const noteByDate = new Map(notes.map((note) => [note.practiceDate, note]));
  // 練習日の枠に、練習日ではない日に書いたノートも混ぜて、新しい順に並べる(明日の分は、書いてあるときだけ)。
  const dates = [...new Set([...schedule.dates, ...noteByDate.keys()])]
    .filter((date) => date <= lastDate)
    .sort((left, right) => right.localeCompare(left));

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">
          {target.displayName} ・ {target.position}
        </span>
        <h1>{target.displayName}のノート</h1>
        <p className="tp-milestone-inline">
          <b>{formatMilestoneMonth(month)}のマイルストーン</b>
          {currentMilestone ?? <span className="tp-muted">まだ決めていません</span>}{" "}
          <Link className="tp-link tp-small" href={buildTeamMilestonesPath(teamSlug, target.id)}>
            これまで
          </Link>
        </p>
        <p className="tp-small tp-muted">まだ書いていない日にも、コメントを付けられます(本人に知らせます)。</p>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={basePath}>
            みんなのノートへ
          </Link>
        </div>
      </header>

      <section className="tp-section">
        {dates.length === 0 ? <p className="tp-small tp-muted">この期間に練習日がありません。</p> : null}
        {dates.map((date) => {
          const note = noteByDate.get(date) ?? null;
          const noteComments = note ? comments.filter((comment) => comment.noteId === note.id) : [];
          if (note && isNoteWritten(note)) {
            return (
              <NoteCard
                key={date}
                note={note}
                comments={noteComments}
                isMine={false}
                canDelete={canAdminister(current)}
                teamSlug={teamSlug}
                milestone={milestoneByMonth.get(monthOf(date)) ?? null}
              />
            );
          }
          return (
            <article key={date} className="tp-card tp-notecard tp-note-unwritten">
              <div className="tp-dayhead">
                <span className="tp-when">{formatNoteDate(date)}</span>
                <span className="tp-what">{target.displayName}</span>
                {milestoneByMonth.get(monthOf(date)) ? (
                  <span className="tp-milestone-chip">
                    <b>目標</b>
                    {milestoneByMonth.get(monthOf(date))}
                  </span>
                ) : null}
              </div>
              <p className="tp-small tp-muted">
                {schedule.eventsByDate[date] ? `${describePracticeEvents(schedule.eventsByDate[date])}:` : ""}
                まだ書いていません
              </p>
              <NoteComments
                compact
                initialComments={noteComments}
                noteId={note?.id ?? null}
                day={{ memberId: target.id, date }}
                teamSlug={teamSlug}
              />
            </article>
          );
        })}
        <p className="tp-small tp-muted">
          今日から {weeks} 週間前までを出しています。
          {weeks < WEEKS_MAX ? (
            <>
              {" "}
              <Link className="tp-link" href={`${basePath}/member?id=${target.id}&weeks=${weeks + WEEKS_STEP}`} scroll={false}>
                さらに前を見る
              </Link>
            </>
          ) : null}
        </p>
      </section>
    </>
  );
}
