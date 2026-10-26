import { MEMBER_GROUPS, type MemberGroup, type MemberPosition } from "@/lib/domain/portal";

export type Note = {
  id: string;
  memberId: string;
  memberName: string;
  practiceDate: string;
  position: MemberPosition | null;
  group: MemberGroup | null;
  body: string;
  request: string;
  // チーム全体への振り返り(2026-10-26 から)。全員に見える。なければ空。
  teamMessage: string;
  updatedAt: string;
  commentCount: number;
};

export type NoteComment = {
  id: string;
  noteId: string;
  memberId: string;
  memberName: string;
  // 背番号(アイコンに出す)。ない人は null。
  memberNumber: string | null;
  body: string;
  createdAt: string;
};

/**
 * コメントが付いたときに知らせる相手。Slack のスレッドと同じで、そのノートの会話に入っている人
 * (ノートを書いた人と、これまでにコメントした人)みんなに知らせる。コメントした本人には知らせない。
 * 書いた人は `author` に、それ以外は `participants` に分ける(知らせの文面が違うため)。
 */
export function pickCommentRecipients(input: {
  authorId: string;
  commenterIds: string[];
  senderId: string;
}): { author: string | null; participants: string[] } {
  const participants = [...new Set(input.commenterIds)].filter(
    (memberId) => memberId !== input.senderId && memberId !== input.authorId,
  );
  return {
    author: input.authorId === input.senderId ? null : input.authorId,
    participants,
  };
}

// 練習日の例外。off = その日は練習なし、extra = いつもの曜日ではないが練習あり。
export type PracticeDayOverride = {
  date: string;
  kind: "off" | "extra";
};

// team:「チームへ」を書いたノートだけ(全員分)。
export const NOTE_FEEDS = [...MEMBER_GROUPS, "all", "team"] as const;
export type NoteFeed = (typeof NOTE_FEEDS)[number];

export const NOTE_FEED_LABELS: Record<NoteFeed, string> = {
  side: "サイド",
  MB: "MB",
  S: "S",
  Li: "Li",
  all: "全員",
  team: "チームへ",
};

/**
 * ノートを書いたか。書いていない日にコメントが付くと、本文が空のノートができる(2026-10-26 から)。
 * そのノートは「まだ書いていない」として扱い、本人があとで書くと、コメントはそのまま残る。
 */
export function isNoteWritten(note: Pick<Note, "body"> | null | undefined): boolean {
  return Boolean(note?.body.trim());
}

export const NOTE_BODY_MAX = 5000;
export const NOTE_REQUEST_MAX = 1000;
export const NOTE_TEAM_MESSAGE_MAX = 2000;
export const NOTE_TEAM_MESSAGE_LABEL = "チームへ";
export const NOTE_COMMENT_MAX = 2000;

// 練習は 日・火・木・土(0 = 日曜)。
const PRACTICE_WEEKDAYS = [0, 2, 4, 6];
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function getWeekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 「11/3(火)」の形。 */
export function formatNoteDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}(${WEEKDAY_LABELS[getWeekday(isoDate)]})`;
}

export function isPracticeDate(isoDate: string, overrides: PracticeDayOverride[]): boolean {
  const override = overrides.find((entry) => entry.date === isoDate);
  if (override) {
    return override.kind === "extra";
  }
  return PRACTICE_WEEKDAYS.includes(getWeekday(isoDate));
}

/** from から to までの練習日を、新しい順に。 */
export function listPracticeDates(
  from: string,
  to: string,
  overrides: PracticeDayOverride[],
): string[] {
  const dates: string[] = [];
  for (let date = to; date >= from; date = shiftDate(date, -1)) {
    if (isPracticeDate(date, overrides)) {
      dates.push(date);
    }
  }
  return dates;
}

export function addDaysToDate(isoDate: string, days: number): string {
  return shiftDate(isoDate, days);
}

/** ノートを書ける、いちばん先の日。過去はいつでも書けて、先は明日まで。 */
export function getLastNoteDate(today: string): string {
  return shiftDate(today, 1);
}

/** 「今日」「明日」「11/3(火)」。 */
export function formatRelativeNoteDate(isoDate: string, today: string): string {
  if (isoDate === today) {
    return "今日";
  }
  return isoDate === shiftDate(today, 1) ? "明日" : formatNoteDate(isoDate);
}
