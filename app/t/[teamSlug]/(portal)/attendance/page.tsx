import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceForm } from "@/components/attendance-form";
import {
  ATTENDANCE_KIND_LABELS,
  describeAttendanceTime,
  getLastAttendanceDate,
  type AttendanceReport,
} from "@/lib/domain/attendance";
import { describePracticeEvents } from "@/lib/domain/calendar";
import { formatNoteDate, isIsoDate } from "@/lib/domain/notes";
import { MEMBER_POSITIONS, canAdminister, isPortalTeam, type Member } from "@/lib/domain/portal";
import { buildTeamAttendancePath } from "@/lib/domain/team";
import { listReports } from "@/lib/server/portal-attendance-store";
import { listMembers } from "@/lib/server/portal-member-store";
import { getPracticeSchedule } from "@/lib/server/portal-calendar";
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

/** 遅刻・早退・欠席の連絡を出す。下で、練習ごとに誰が来られるかをポジション別に見る。 */
export default async function TeamAttendancePage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamAttendancePath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const today = getTodayInJapan();
  const until = getLastAttendanceDate(today);

  const [schedule, members, reports] = await Promise.all([
    getPracticeSchedule(teamSlug, today, until),
    listMembers(teamSlug),
    listReports(teamSlug, { from: today, to: until }),
  ]);
  // これからの予定がある日(古い順)。予定のない日に出された連絡があれば、その日も並べる。
  const practiceDates = [
    ...new Set([...schedule.dates, ...reports.map((report) => report.practiceDate)]),
  ].sort();
  const eventLabels = Object.fromEntries(
    Object.entries(schedule.eventsByDate).map(([date, events]) => [date, describePracticeEvents(events)]),
  );
  // 連絡を出したあとで、カレンダーからその日の予定がなくなることがある(急なオフなど)。
  // 連絡は消さずに残し、その日には「予定なし」と出す。
  const scheduledDates = new Set(schedule.dates);
  const hasNoEvent = (date: string) => schedule.source === "calendar" && !scheduledDates.has(date);
  for (const date of practiceDates) {
    if (hasNoEvent(date)) {
      eventLabels[date] = "予定なし";
    }
  }

  const { date: requestedDate } = await searchParams;
  const selectedDate =
    isIsoDate(requestedDate) && requestedDate >= today && requestedDate <= until
      ? requestedDate
      : (schedule.dates[0] ?? practiceDates[0] ?? today);
  const dayReports = new Map(
    reports.filter((report) => report.practiceDate === selectedDate).map((report) => [report.memberId, report]),
  );
  const countByDate = new Map<string, number>();
  for (const report of reports) {
    countByDate.set(report.practiceDate, (countByDate.get(report.practiceDate) ?? 0) + 1);
  }

  const groups: { label: string; members: Member[] }[] = [
    ...MEMBER_POSITIONS.map((position) => ({
      label: position as string,
      members: members.filter((member) => member.position === position),
    })),
    { label: "スタッフ", members: members.filter((member) => !member.position) },
  ].filter((group) => group.members.length > 0);

  const describe = (report: AttendanceReport | undefined) =>
    report
      ? [ATTENDANCE_KIND_LABELS[report.kind], describeAttendanceTime(report)].filter(Boolean).join(" ")
      : "";

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">遅刻・早退・欠席</span>
        <h1>出欠の連絡</h1>
      </header>

      <section className="tp-section">
        <h2>連絡する</h2>
        <AttendanceForm
          // 連絡を出したあとに、欄を新しい状態で作り直す。
          key={`${selectedDate}-${reports.filter((report) => report.memberId === current.id).length}`}
          canTestChannel={canAdminister(current.role)}
          initialDate={selectedDate}
          myReports={reports.filter((report) => report.memberId === current.id)}
          eventLabels={eventLabels}
          lastDate={until}
          practiceDates={practiceDates}
          teamSlug={teamSlug}
          today={today}
        />
      </section>

      <section className="tp-section">
        <h2>練習ごとの出欠</h2>
        <nav className="tp-weeks" aria-label="練習日">
          {practiceDates.map((date) => (
            <Link
              key={date}
              href={`${basePath}?date=${date}`}
              aria-current={date === selectedDate ? "page" : undefined}
              className={hasNoEvent(date) ? "tp-no-event" : undefined}
              scroll={false}
            >
              <b>{formatNoteDate(date)}</b>
              {eventLabels[date] ? <span>{eventLabels[date]}</span> : null}
              <span className={date === today ? "tp-now" : undefined}>
                {date === today ? "今日 ・ " : ""}
                連絡 {countByDate.get(date) ?? 0}件
              </span>
            </Link>
          ))}
        </nav>

        <p className="tp-small tp-muted">
          {formatNoteDate(selectedDate)}
          {eventLabels[selectedDate] ? ` ${eventLabels[selectedDate]}` : ""}
          :連絡のない人は、来られるものとして数えています。
        </p>
        {hasNoEvent(selectedDate) ? (
          <p className="tp-note">
            この日は、部のカレンダーに予定がありません(オフになった、など)。出してあった連絡は、そのまま残してあります。
          </p>
        ) : null}
        {canAdminister(current.role) ? (
          <p className="tp-small tp-muted">
            {schedule.source === "calendar"
              ? "練習日は、部の Google カレンダーから取っています(「オフ」以外の予定がある日。直してから、サイトに出るまで長くて1分。Google 側の反映に、さらに時間がかかることがあります)。"
              : `練習日は、曜日の決め打ち(日・火・木・土)です。${schedule.error ? `カレンダーを読めませんでした:${schedule.error}` : "PRACTICE_CALENDAR_ICS_URL が入っていません。"}`}
          </p>
        ) : null}

        {groups.map((group) => {
          const absent = group.members.filter((member) => dayReports.get(member.id)?.kind === "absent");
          const partial = group.members.filter((member) => {
            const kind = dayReports.get(member.id)?.kind;
            return kind && kind !== "absent";
          });
          return (
            <article key={group.label} className="tp-card">
              <div className="tp-dayhead">
                <span className="tp-when">{group.label}</span>
                <span className="tp-what">
                  来られる {group.members.length - absent.length} / {group.members.length}人
                </span>
                <span className="tp-time">
                  {[
                    absent.length > 0 ? `欠席 ${absent.length}` : "",
                    partial.length > 0 ? `遅刻・早退 ${partial.length}` : "",
                  ]
                    .filter(Boolean)
                    .join(" ・ ")}
                </span>
              </div>
              <ul className="tp-attendance">
                {group.members.map((member) => {
                  const report = dayReports.get(member.id);
                  return (
                    <li
                      key={member.id}
                      className={
                        report ? (report.kind === "absent" ? "tp-att-absent" : "tp-att-partial") : undefined
                      }
                    >
                      <span className="tp-att-name">
                        {member.displayName}
                        {member.position ? "" : member.title ? `(${member.title})` : ""}
                      </span>
                      <span className="tp-att-status">{report ? describe(report) : "○"}</span>
                      {report?.reason ? <span className="tp-att-reason">{report.reason}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </section>
    </>
  );
}
