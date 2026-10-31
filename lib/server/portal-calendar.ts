import { parseCalendarEvents, type PracticeEvent } from "@/lib/domain/calendar";
import { listPracticeDates } from "@/lib/domain/notes";
import { listPracticeDayOverrides } from "@/lib/server/portal-note-store";

export type PracticeSchedule = {
  // calendar = 部の Google カレンダーから。weekdays = カレンダーが未設定か読めないときの決め打ち(日・火・木・土)。
  source: "calendar" | "weekdays";
  // 練習などの予定がある日(古い順)。
  dates: string[];
  eventsByDate: Record<string, PracticeEvent[]>;
  // 「オフ」の予定(off の印つき)。予定表にだけ別の色で出す。dates・eventsByDate には入れない(出欠とノートの対象外)。
  offEventsByDate: Record<string, PracticeEvent[]>;
  // カレンダーを読めなかったときの理由(システム担当に見せる)。
  error?: string;
};

// カレンダーは1分ごとに読み直す(サイト側の遅れは長くて1分。Google が iCal の中身を新しくするまでの遅れは別にある)。
const REVALIDATE_SECONDS = 60;

async function fetchCalendarText(url: string): Promise<string> {
  const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!response.ok) {
    throw new Error(`カレンダーを取りに行って、${response.status} が返りました。`);
  }
  const text = await response.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("返ってきたものが iCal の形ではありません。URL が「iCal 形式の非公開 URL」かを確かめてください。");
  }
  return text;
}

/**
 * from〜to の、練習などの予定がある日。部の Google カレンダー(`PRACTICE_CALENDAR_ICS_URL`)を見る。
 * 「オフ」以外の予定は、時刻つきも終日も対象。カレンダーが未設定か読めないときは、曜日の決め打ちに戻る。
 */
export async function getPracticeSchedule(
  teamSlug: string,
  from: string,
  to: string,
): Promise<PracticeSchedule> {
  const url = process.env.PRACTICE_CALENDAR_ICS_URL?.trim();
  let error: string | undefined;

  if (url) {
    try {
      const events = parseCalendarEvents(await fetchCalendarText(url), from, to, { includeOff: true });
      const eventsByDate: Record<string, PracticeEvent[]> = {};
      const offEventsByDate: Record<string, PracticeEvent[]> = {};
      for (const event of events) {
        ((event.off ? offEventsByDate : eventsByDate)[event.date] ??= []).push(event);
      }
      return { source: "calendar", dates: Object.keys(eventsByDate).sort(), eventsByDate, offEventsByDate };
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "カレンダーを読めませんでした。";
      console.error("[portal-calendar] failed", error);
    }
  }

  const overrides = await listPracticeDayOverrides(teamSlug);
  return {
    source: "weekdays",
    dates: listPracticeDates(from, to, overrides).reverse(),
    eventsByDate: {},
    offEventsByDate: {},
    error,
  };
}
