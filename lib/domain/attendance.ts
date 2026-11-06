import { formatNoteDate } from "@/lib/domain/notes";
import type { MemberPosition } from "@/lib/domain/portal";

export const ATTENDANCE_KINDS = ["absent", "late", "early", "late_early"] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

export const ATTENDANCE_KIND_LABELS: Record<AttendanceKind, string> = {
  absent: "欠席",
  late: "遅刻",
  early: "早退",
  late_early: "遅刻・早退",
};

export type AttendanceReport = {
  id: string;
  memberId: string;
  memberName: string;
  position: MemberPosition | null;
  practiceDate: string;
  kind: AttendanceKind;
  // 遅刻:何時から来るか。早退:何時までいるか。'HH:MM'
  arriveAt: string | null;
  leaveAt: string | null;
  reason: string;
  // 備考(書かなくてよい。2026-11-06 から)。
  note: string;
};

export const ATTENDANCE_REASON_MAX = 500;
export const ATTENDANCE_NOTE_MAX = 500;
// 連絡は、今日から3か月先の日まで出せる(2026-11-06 に2か月から延ばした。けーいちの依頼)。
export const ATTENDANCE_MONTHS_AHEAD = 3;

/** 今日から、連絡を出せるいちばん先の日(3か月後の同じ日。その月にない日なら月末)。 */
export function getLastAttendanceDate(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month - 1 + ATTENDANCE_MONTHS_AHEAD + 1, 0)).getUTCDate();
  const target = new Date(
    Date.UTC(year, month - 1 + ATTENDANCE_MONTHS_AHEAD, Math.min(day, lastDayOfTargetMonth)),
  );
  return target.toISOString().slice(0, 10);
}

export function isAttendanceKind(value: unknown): value is AttendanceKind {
  return ATTENDANCE_KINDS.includes(value as AttendanceKind);
}

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function needsArriveTime(kind: AttendanceKind): boolean {
  return kind === "late" || kind === "late_early";
}

export function needsLeaveTime(kind: AttendanceKind): boolean {
  return kind === "early" || kind === "late_early";
}

/** 「18:00 から」「19:30 まで」「18:00 から 19:30 まで」。欠席は空。 */
export function describeAttendanceTime(
  report: Pick<AttendanceReport, "kind" | "arriveAt" | "leaveAt">,
): string {
  return [
    needsArriveTime(report.kind) && report.arriveAt ? `${report.arriveAt} から` : "",
    needsLeaveTime(report.kind) && report.leaveAt ? `${report.leaveAt} まで` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Slack のチャンネルに流す文。 */
export function formatAttendanceMessage(
  report: AttendanceReport,
  event: "new" | "updated" | "canceled",
): string {
  const who = `${report.memberName}${report.position ? `(${report.position})` : ""}`;
  const date = formatNoteDate(report.practiceDate);
  const label = ATTENDANCE_KIND_LABELS[report.kind];
  if (event === "canceled") {
    return `【取り消し】${date} ${who} の${label}の連絡は取り消されました`;
  }

  const time = describeAttendanceTime(report);
  return [
    `${event === "updated" ? "【訂正】" : ""}【${label}】${date} ${who}${time ? ` ${time}` : ""}`,
    `理由:${report.reason || "(書かれていません)"}`,
    ...(report.note ? [`備考:${report.note}`] : []),
  ].join("\n");
}

/** 一人の遅刻・早退・欠席の回数。「遅刻・早退」の連絡は、遅刻と早退の両方に1回ずつ数える。 */
export type AttendanceTally = {
  absent: number;
  late: number;
  early: number;
};

export const EMPTY_TALLY: AttendanceTally = { absent: 0, late: 0, early: 0 };

/** 連絡を、部員ごとの回数にまとめる(出欠のページの下の集計、2026-10-31 から)。 */
export function tallyAttendance(
  reports: Pick<AttendanceReport, "memberId" | "kind">[],
): Map<string, AttendanceTally> {
  const tallies = new Map<string, AttendanceTally>();
  for (const report of reports) {
    const tally = tallies.get(report.memberId) ?? { ...EMPTY_TALLY };
    if (report.kind === "absent") {
      tally.absent += 1;
    }
    if (needsArriveTime(report.kind)) {
      tally.late += 1;
    }
    if (needsLeaveTime(report.kind)) {
      tally.early += 1;
    }
    tallies.set(report.memberId, tally);
  }
  return tallies;
}

// 集計の期間:今月(1日から今日まで)か、これまで全部(今日まで)。
export const ATTENDANCE_TALLY_SPANS = ["month", "all"] as const;
export type AttendanceTallySpan = (typeof ATTENDANCE_TALLY_SPANS)[number];

// 集計を始める日。これより前の連絡(テストで送ったものが多い)は数えない(けーいちの決定、2026-10-31:「集計は11/1開始」)。
export const ATTENDANCE_TALLY_START = "2026-11-01";

/** 集計の期間の始まりの日。今月なら1日から、全部なら集計を始めた日から(どちらも ATTENDANCE_TALLY_START より前にはしない)。 */
export function getTallyStart(today: string, span: AttendanceTallySpan): string {
  const start = span === "all" ? ATTENDANCE_TALLY_START : `${today.slice(0, 7)}-01`;
  return start < ATTENDANCE_TALLY_START ? ATTENDANCE_TALLY_START : start;
}

// ---------- 入力の確かめ(1日分・まとめての両方で使う) ----------

export type AttendanceInput = {
  kind: AttendanceKind;
  arriveAt: string | null;
  leaveAt: string | null;
  reason: string;
  note: string;
};

/** 種類・時刻・理由を確かめる。おかしければ、画面に出す言葉を返す。 */
export function parseAttendanceInput(payload: {
  kind?: unknown;
  arriveAt?: unknown;
  leaveAt?: unknown;
  reason?: unknown;
  note?: unknown;
}): { input: AttendanceInput } | { error: string } {
  if (!isAttendanceKind(payload.kind)) {
    return { error: "欠席・遅刻・早退のどれかを選んでください。" };
  }
  const arriveAt = needsArriveTime(payload.kind) ? payload.arriveAt : null;
  const leaveAt = needsLeaveTime(payload.kind) ? payload.leaveAt : null;
  if (arriveAt !== null && !isClockTime(arriveAt)) {
    return { error: "遅刻のときは、何時から来られるかを入れてください。" };
  }
  if (leaveAt !== null && !isClockTime(leaveAt)) {
    return { error: "早退のときは、何時までいられるかを入れてください。" };
  }
  if (arriveAt && leaveAt && arriveAt >= leaveAt) {
    return { error: "来る時刻が、帰る時刻より後になっています。" };
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, ATTENDANCE_REASON_MAX) : "";
  if (!reason) {
    return { error: "理由を書いてください。" };
  }
  const note = typeof payload.note === "string" ? payload.note.trim().slice(0, ATTENDANCE_NOTE_MAX) : "";
  return {
    input: { kind: payload.kind, arriveAt: arriveAt as string | null, leaveAt: leaveAt as string | null, reason, note },
  };
}

// ---------- まとめて出す(2026-11-06 から。授業で毎週火曜は 18:30 から、のような人のため) ----------

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 一度にまとめて出せる日の数(3か月分の練習日。週4日 × 13週より多めに)。 */
export const ATTENDANCE_BULK_MAX = 60;

/** 'YYYY-MM-DD' の曜日(0 = 日曜)。 */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 練習のある日のうち、選んだ曜日の日(古い順)。 */
export function pickDatesByWeekday(practiceDates: string[], weekdays: number[]): string[] {
  return [...new Set(practiceDates)].filter((date) => weekdays.includes(weekdayOf(date))).sort();
}

/** まとめて出したときに、Slack のチャンネルに流す文(1通にまとめる)。 */
export function formatBulkAttendanceMessage(
  who: { memberName: string; position: MemberPosition | null },
  dates: string[],
  input: AttendanceInput,
  updatedCount: number,
): string {
  const name = `${who.memberName}${who.position ? `(${who.position})` : ""}`;
  const time = describeAttendanceTime(input);
  return [
    `【${ATTENDANCE_KIND_LABELS[input.kind]}・まとめて${dates.length}日】${name}${time ? ` ${time}` : ""}`,
    `日付:${dates.map((date) => formatNoteDate(date)).join("、")}`,
    `理由:${input.reason}`,
    ...(input.note ? [`備考:${input.note}`] : []),
    ...(updatedCount ? [`(うち${updatedCount}日は、前に出した連絡を訂正)`] : []),
  ].join("\n");
}
