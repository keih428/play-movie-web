import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PRACTICE_LOCATION, type PracticeEvent } from "@/lib/domain/calendar";
import { formatNoteDate } from "@/lib/domain/notes";
import { canAdminister, canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamSchedulePath } from "@/lib/domain/team";
import { getPracticeSchedule } from "@/lib/server/portal-calendar";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    month?: string;
  }>;
};

export const dynamic = "force-dynamic";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
// 前後に動ける月の幅(カレンダーを読む量を抑えるため)。
const MONTH_RANGE = 12;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 'YYYY-MM' に months か月を足す。 */
function shiftMonth(month: string, months: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + months, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function monthDistance(from: string, to: string): number {
  const [fromYear, fromIndex] = from.split("-").map(Number);
  const [toYear, toIndex] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toIndex - fromIndex);
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** その月を、日曜はじまりの週ごとに並べる(前後の月の日で埋める)。 */
function buildMonthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const last = shiftDate(`${shiftMonth(month, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let date = shiftDate(first, -getWeekday(first)); date <= last; ) {
    const week: string[] = [];
    for (let day = 0; day < 7; day += 1) {
      week.push(date);
      date = shiftDate(date, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function describeTime(event: PracticeEvent): string {
  return event.start ? `${event.start}〜${event.end ?? ""}` : "終日";
}

/** 部の予定を月のカレンダーで見る。練習日には、Google カレンダーの予定名・時間・場所を出す。 */
export default async function TeamSchedulePage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamSchedulePath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const today = getTodayInJapan();
  const thisMonth = today.slice(0, 7);

  const { month: requestedMonth } = await searchParams;
  const month =
    requestedMonth &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) &&
    Math.abs(monthDistance(thisMonth, requestedMonth)) <= MONTH_RANGE
      ? requestedMonth
      : thisMonth;

  const weeks = buildMonthGrid(month);
  const schedule = await getPracticeSchedule(teamSlug, weeks[0][0], weeks[weeks.length - 1][6]);
  // カレンダーを読めないときは、曜日の決め打ちの日を「練習」として出す(時間はわからない)。
  const eventsOn = (date: string): PracticeEvent[] =>
    schedule.source === "calendar"
      ? (schedule.eventsByDate[date] ?? [])
      : schedule.dates.includes(date)
        ? [{ date, title: "練習", start: null, end: null, location: null }]
        : [];

  const [year, monthIndex] = month.split("-").map(Number);
  const monthDates = weeks.flat().filter((date) => date.startsWith(month));
  const practiceDays = monthDates.filter((date) => eventsOn(date).length > 0);
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const canGo = (target: string) => Math.abs(monthDistance(thisMonth, target)) <= MONTH_RANGE;

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">練習・試合の予定</span>
        <h1>予定表</h1>
      </header>

      <section className="tp-section">
        <div className="tp-cal-head">
          {canGo(previous) ? (
            <Link href={`${basePath}?month=${previous}`} className="tp-cal-move" scroll={false}>
              ← 前の月
            </Link>
          ) : (
            <span />
          )}
          <h2>
            {year}年{monthIndex}月
          </h2>
          {canGo(next) ? (
            <Link href={`${basePath}?month=${next}`} className="tp-cal-move" scroll={false}>
              次の月 →
            </Link>
          ) : (
            <span />
          )}
        </div>
        {month !== thisMonth ? (
          <p className="tp-small">
            <Link href={basePath} scroll={false}>
              今月に戻る
            </Link>
          </p>
        ) : null}

        <table className="tp-cal">
          <thead>
            <tr>
              {WEEKDAYS.map((label, index) => (
                <th key={label} scope="col" data-weekday={index}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((date) => {
                  const events = eventsOn(date);
                  const classNames = [
                    date.startsWith(month) ? "" : "tp-cal-out",
                    date < today ? "tp-cal-past" : "",
                    date === today ? "tp-cal-today" : "",
                    events.length > 0 ? "tp-cal-has" : "",
                  ].filter(Boolean);
                  return (
                    <td key={date} className={classNames.join(" ") || undefined} data-weekday={getWeekday(date)}>
                      <span className="tp-cal-day">{Number(date.slice(8))}</span>
                      {events.map((event, index) => (
                        <span key={index} className="tp-cal-event">
                          <b>{event.title}</b>
                          <span className="tp-cal-long">{describeTime(event)}</span>
                          {/* スマホではマスが狭いので、始まりの時刻だけにする。 */}
                          <span className="tp-cal-short">{event.start ?? "終日"}</span>
                          <span className="tp-cal-long">{event.location ?? DEFAULT_PRACTICE_LOCATION}</span>
                        </span>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tp-section">
        <h2>{monthIndex}月の練習・予定</h2>
        {practiceDays.length === 0 ? (
          <p className="tp-muted">この月の予定は、まだ入っていません。</p>
        ) : (
          <ul className="tp-cal-list">
            {practiceDays.map((date) =>
              eventsOn(date).map((event, index) => (
                <li
                  key={`${date}-${index}`}
                  className={[date < today ? "tp-cal-past" : "", date === today ? "tp-cal-today" : ""]
                    .filter(Boolean)
                    .join(" ") || undefined}
                >
                  <span className="tp-cal-date">
                    {formatNoteDate(date)}
                    {date === today ? " 今日" : ""}
                  </span>
                  <b>{event.title}</b>
                  <span className="tp-cal-time">{describeTime(event)}</span>
                  <span className="tp-cal-place">{event.location ?? DEFAULT_PRACTICE_LOCATION}</span>
                </li>
              )),
            )}
          </ul>
        )}

        {canAdminister(current) || canManageSite(current) ? (
          <p className="tp-small tp-muted">
            {schedule.source === "calendar"
              ? `予定は、部の Google カレンダーから取っています(「オフ」の予定は出しません。場所が空なら「${DEFAULT_PRACTICE_LOCATION}」。直してから、サイトに出るまで長くて1分。Google 側の反映に、さらに時間がかかることがあります)。`
              : `カレンダーを読めないので、曜日の決め打ち(日・火・木・土)の日を出しています。${schedule.error ? `理由:${schedule.error}` : "PRACTICE_CALENDAR_ICS_URL が入っていません。"}`}
          </p>
        ) : null}
      </section>
    </>
  );
}
