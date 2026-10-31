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
};

export const ATTENDANCE_REASON_MAX = 500;
// 連絡は、今日から2か月先の日まで出せる。
export const ATTENDANCE_MONTHS_AHEAD = 2;

/** 今日から、連絡を出せるいちばん先の日(2か月後の同じ日。その月にない日なら月末)。 */
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
