import ICAL from "ical.js";

// 部の Google カレンダーの予定を、日ごとに並べたもの。
export type PracticeEvent = {
  date: string;
  title: string;
  // 時刻つきの予定の始まりと終わり('HH:MM'、日本時間)。終日の予定は null。
  start: string | null;
  end: string | null;
  // カレンダーの「場所」。書かれていなければ null(画面では「駒場」と出す)。
  location: string | null;
  // カレンダーの「説明」(練習試合の相手など)。HTML は外して、ただの文にしてある。書かれていなければ null。
  description: string | null;
};

// 予定の説明は、長すぎるものを切る(画面とページの大きさを抑えるため)。
const MAX_DESCRIPTION_LENGTH = 1000;

/** Google カレンダーの説明は HTML のことがある。改行は残して、タグを外し、文字の参照を戻す。 */
export function toPlainDescription(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, MAX_DESCRIPTION_LENGTH) : null;
}

// 場所が書かれていない練習は、駒場でやる。
export const DEFAULT_PRACTICE_LOCATION = "駒場";

const TIME_ZONE = "Asia/Tokyo";
const MAX_OCCURRENCES = 5000;

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE });
const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 「オフ」で始まる予定は、練習のない日の印なので、出欠とノートの対象にしない。 */
export function isOffEvent(title: string): boolean {
  return title.trim().startsWith("オフ");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateOnly(time: ICAL.Time): string {
  return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 1回ぶんの予定を、日ごとの行にする。終日で何日か続く予定(合宿など)は、1日ずつに分ける。 */
function expandOccurrence(
  title: string,
  location: string | null,
  description: string | null,
  start: ICAL.Time,
  end: ICAL.Time | null,
): PracticeEvent[] {
  if (start.isDate) {
    const first = toDateOnly(start);
    // 終日の予定の終わりは「次の日」で書かれている。
    const last = end ? shiftDate(toDateOnly(end), -1) : first;
    const events: PracticeEvent[] = [];
    for (let date = first; date <= last && events.length < 60; date = shiftDate(date, 1)) {
      events.push({ date, title, start: null, end: null, location, description });
    }
    return events.length > 0 ? events : [{ date: first, title, start: null, end: null, location, description }];
  }

  const startDate = start.toJSDate();
  return [
    {
      date: dateFormatter.format(startDate),
      title,
      start: timeFormatter.format(startDate),
      end: end ? timeFormatter.format(end.toJSDate()) : null,
      location,
      description,
    },
  ];
}

/**
 * iCal の文から、from〜to(日本時間の日付)の予定を取り出す。くり返しの予定は1回ずつに開き、
 * 取り消された回・その回だけ変えた予定にも合わせる。「オフ」の予定は含めない。
 */
export function parseCalendarEvents(icsText: string, from: string, to: string): PracticeEvent[] {
  const root = new ICAL.Component(ICAL.parse(icsText));
  for (const timezone of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(timezone);
  }

  const components = root
    .getAllSubcomponents("vevent")
    .filter((component) => component.getFirstPropertyValue("status") !== "CANCELLED");

  // くり返しのうち「その回だけ変えた予定」は別の VEVENT として入っている。元の回は出さないようにする。
  const overridden = new Set<string>();
  for (const component of components) {
    const event = new ICAL.Event(component);
    if (event.recurrenceId) {
      overridden.add(`${event.uid}|${event.recurrenceId.toJSDate().getTime()}`);
    }
  }

  const events: PracticeEvent[] = [];
  for (const component of components) {
    const event = new ICAL.Event(component);
    const title = (event.summary ?? "").trim() || "(名前のない予定)";
    if (isOffEvent(title)) {
      continue;
    }
    const location = (event.location ?? "").trim() || null;
    const description = toPlainDescription(event.description);

    if (!event.isRecurring()) {
      events.push(...expandOccurrence(title, location, description, event.startDate, event.endDate));
      continue;
    }

    const iterator = event.iterator();
    for (let count = 0; count < MAX_OCCURRENCES; count += 1) {
      const next = iterator.next();
      if (!next) {
        break;
      }
      const occurrenceDate = next.isDate ? toDateOnly(next) : dateFormatter.format(next.toJSDate());
      if (occurrenceDate > to) {
        break;
      }
      if (overridden.has(`${event.uid}|${next.toJSDate().getTime()}`)) {
        continue;
      }
      const end = next.clone();
      end.addDuration(event.duration);
      events.push(...expandOccurrence(title, location, description, next, end));
    }
  }

  return events
    .filter((event) => event.date >= from && event.date <= to)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || (left.start ?? "").localeCompare(right.start ?? ""),
    );
}

/** 「通常練習 17:00〜21:00」の形。同じ日に予定がいくつかあれば「/」でつなぐ。 */
export function describePracticeEvents(events: PracticeEvent[]): string {
  return events
    .map((event) => (event.start ? `${event.title} ${event.start}〜${event.end ?? ""}` : event.title))
    .join(" / ");
}
