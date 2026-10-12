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
