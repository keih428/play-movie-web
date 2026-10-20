import Link from "next/link";
import { notFound } from "next/navigation";
import { EventDetail, ScheduleCalendar } from "@/components/schedule-calendar";
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
    // view=week なら週の表示。week は表示する週の日曜('YYYY-MM-DD')。
    view?: string;
    week?: string;
  }>;
};

export const dynamic = "force-dynamic";

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

/** 'YYYY-MM-DD' が入っている週の日曜。 */
function startOfWeek(isoDate: string): string {
  return shiftDate(isoDate, -getWeekday(isoDate));
}

/**
 * 部の予定を、月のカレンダーか週の一覧で見る。Google カレンダーの予定名・時間・場所・説明を出す。
 * 月のカレンダーは、日付を押すとその日の詳細が開く。週の一覧は、直近の予定を詳細つきで並べる(部員の声、2026-10-20)。
 */
export default async function TeamSchedulePage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamSchedulePath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const today = getTodayInJapan();
  const thisMonth = today.slice(0, 7);

  const { month: requestedMonth, view, week: requestedWeek } = await searchParams;
  const month =
    requestedMonth &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) &&
    Math.abs(monthDistance(thisMonth, requestedMonth)) <= MONTH_RANGE
      ? requestedMonth
      : thisMonth;

  const isWeekView = view === "week";
  const thisWeek = startOfWeek(today);
  const weekStart =
    requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) && getWeekday(requestedWeek) === 0 &&
    Math.abs(monthDistance(thisMonth, requestedWeek.slice(0, 7))) <= MONTH_RANGE
      ? requestedWeek
      : thisWeek;
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));

  const weeks = buildMonthGrid(month);
  const schedule = isWeekView
    ? await getPracticeSchedule(teamSlug, weekDates[0], weekDates[6])
    : await getPracticeSchedule(teamSlug, weeks[0][0], weeks[weeks.length - 1][6]);
  // カレンダーを読めないときは、曜日の決め打ちの日を「練習」として出す(時間はわからない)。
  const eventsOn = (date: string): PracticeEvent[] =>
    schedule.source === "calendar"
      ? (schedule.eventsByDate[date] ?? [])
      : schedule.dates.includes(date)
        ? [{ date, title: "練習", start: null, end: null, location: null, description: null }]
        : [];

  const [year, monthIndex] = month.split("-").map(Number);
  const monthDates = weeks.flat().filter((date) => date.startsWith(month));
  const practiceDays = monthDates.filter((date) => eventsOn(date).length > 0);
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const canGo = (target: string) => Math.abs(monthDistance(thisMonth, target)) <= MONTH_RANGE;
  const previousWeek = shiftDate(weekStart, -7);
  const nextWeek = shiftDate(weekStart, 7);
  const eventsByDate = Object.fromEntries(
    (isWeekView ? weekDates : weeks.flat()).map((date) => [date, eventsOn(date)]),
  );
  const sourceNote =
    canAdminister(current) || canManageSite(current) ? (
      <p className="tp-small tp-muted">
        {schedule.source === "calendar"
          ? `予定は、部の Google カレンダーから取っています(「オフ」の予定は出しません。場所が空なら「${DEFAULT_PRACTICE_LOCATION}」。練習試合の相手などは、カレンダーの「説明」に書くと出ます。直してから、サイトに出るまで長くて1分。Google 側の反映に、さらに時間がかかることがあります)。`
          : `カレンダーを読めないので、曜日の決め打ち(日・火・木・土)の日を出しています。${schedule.error ? `理由:${schedule.error}` : "PRACTICE_CALENDAR_ICS_URL が入っていません。"}`}
      </p>
    ) : null;
  const viewSwitch = (
    <div className="tp-seg tp-cal-view" role="group" aria-label="表示の切り替え">
      <Link href={basePath} aria-current={isWeekView ? undefined : "true"} scroll={false}>
        月
      </Link>
      <Link href={`${basePath}?view=week`} aria-current={isWeekView ? "true" : undefined} scroll={false}>
        週
      </Link>
    </div>
  );

  if (isWeekView) {
    const [, fromMonth, fromDay] = weekDates[0].split("-").map(Number);
    const [, toMonth, toDay] = weekDates[6].split("-").map(Number);
    const canGoWeek = (target: string) => canGo(target.slice(0, 7));
    return (
      <>
        <header className="tp-hero">
          <span className="tp-eyebrow">練習・試合の予定</span>
          <h1>予定表</h1>
        </header>

        <section className="tp-section">
          {viewSwitch}
          <div className="tp-cal-head">
            {canGoWeek(previousWeek) ? (
              <Link href={`${basePath}?view=week&week=${previousWeek}`} className="tp-cal-move" scroll={false}>
                ← 前の週
              </Link>
            ) : (
              <span />
            )}
            <h2>
              {fromMonth}/{fromDay}〜{toMonth}/{toDay}
            </h2>
            {canGoWeek(nextWeek) ? (
              <Link href={`${basePath}?view=week&week=${nextWeek}`} className="tp-cal-move" scroll={false}>
                次の週 →
              </Link>
            ) : (
              <span />
            )}
          </div>
          {weekStart !== thisWeek ? (
            <p className="tp-small">
              <Link href={`${basePath}?view=week`} scroll={false}>
                今週に戻る
              </Link>
            </p>
          ) : null}

          <ol className="tp-week">
            {weekDates.map((date) => {
              const events = eventsByDate[date] ?? [];
              return (
                <li
                  key={date}
                  className={[date < today ? "tp-cal-past" : "", date === today ? "tp-cal-today" : ""]
                    .filter(Boolean)
                    .join(" ") || undefined}
                  data-weekday={getWeekday(date)}
                >
                  <span className="tp-week-date">
                    {formatNoteDate(date)}
                    {date === today ? <span className="tp-week-today">今日</span> : null}
                  </span>
                  <div className="tp-week-events">
                    {events.length ? (
                      events.map((event, index) => (
                        <EventDetail key={index} event={event} defaultLocation={DEFAULT_PRACTICE_LOCATION} />
                      ))
                    ) : (
                      <span className="tp-muted tp-small">予定なし</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {sourceNote}
        </section>
      </>
    );
  }

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">練習・試合の予定</span>
        <h1>予定表</h1>
      </header>

      <section className="tp-section">
        {viewSwitch}
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

        <p className="tp-small tp-muted">予定のある日を押すと、詳しい内容が開きます。</p>
        <ScheduleCalendar
          weeks={weeks}
          month={month}
          today={today}
          eventsByDate={eventsByDate}
          defaultLocation={DEFAULT_PRACTICE_LOCATION}
        />
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
                  {event.description ? <span className="tp-cal-desc">{event.description}</span> : null}
                </li>
              )),
            )}
          </ul>
        )}

        {sourceNote}
      </section>
    </>
  );
}
