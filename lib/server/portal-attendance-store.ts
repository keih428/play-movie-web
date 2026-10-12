import { randomUUID } from "node:crypto";
import type { AttendanceKind, AttendanceReport } from "@/lib/domain/attendance";
import type { MemberPosition } from "@/lib/domain/portal";
import { query } from "@/lib/server/portal-db";

type ReportRow = {
  id: string;
  member_id: string;
  member_name: string;
  position: string | null;
  practice_date: string;
  kind: AttendanceKind;
  arrive_at: string | null;
  leave_at: string | null;
  reason: string;
};

const REPORT_SELECT = `
  SELECT r.id, r.member_id, m.name AS member_name, m.position, r.practice_date, r.kind,
         r.arrive_at, r.leave_at, r.reason
  FROM attendance_reports r JOIN members m ON m.id = r.member_id`;

function toReport(row: ReportRow): AttendanceReport {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    position: row.position as MemberPosition | null,
    practiceDate: row.practice_date,
    kind: row.kind,
    arriveAt: row.arrive_at,
    leaveAt: row.leave_at,
    reason: row.reason,
  };
}

export async function getReport(memberId: string, practiceDate: string): Promise<AttendanceReport | null> {
  const rows = await query<ReportRow>(
    `${REPORT_SELECT} WHERE r.member_id = $1 AND r.practice_date = $2`,
    [memberId, practiceDate],
  );
  return rows[0] ? toReport(rows[0]) : null;
}

/** その日から先の連絡を、日付の古い順に。部員で絞れる。 */
export async function listReports(
  teamSlug: string,
  filter: { from: string; to?: string; memberId?: string },
): Promise<AttendanceReport[]> {
  const rows = await query<ReportRow>(
    `${REPORT_SELECT}
     WHERE r.team_slug = $1 AND m.active
       AND r.practice_date >= $2
       AND ($3::text IS NULL OR r.practice_date <= $3)
       AND ($4::text IS NULL OR r.member_id = $4)
     ORDER BY r.practice_date, m.sort_order`,
    [teamSlug, filter.from, filter.to ?? null, filter.memberId ?? null],
  );
  return rows.map(toReport);
}

/** その日の連絡を出す(もう出してあれば上書き)。前からあったかどうかも返す。 */
export async function saveReport(input: {
  teamSlug: string;
  memberId: string;
  practiceDate: string;
  kind: AttendanceKind;
  arriveAt: string | null;
  leaveAt: string | null;
  reason: string;
}): Promise<{ report: AttendanceReport; existed: boolean }> {
  const existed = Boolean(await getReport(input.memberId, input.practiceDate));
  await query(
    `INSERT INTO attendance_reports (id, team_slug, member_id, practice_date, kind, arrive_at, leave_at, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (member_id, practice_date) DO UPDATE SET
       kind = EXCLUDED.kind, arrive_at = EXCLUDED.arrive_at, leave_at = EXCLUDED.leave_at,
       reason = EXCLUDED.reason, updated_at = now()`,
    [
      randomUUID(),
      input.teamSlug,
      input.memberId,
      input.practiceDate,
      input.kind,
      input.arriveAt,
      input.leaveAt,
      input.reason,
    ],
  );
  return { report: (await getReport(input.memberId, input.practiceDate))!, existed };
}

export async function deleteReport(memberId: string, practiceDate: string): Promise<AttendanceReport | null> {
  const report = await getReport(memberId, practiceDate);
  if (report) {
    await query("DELETE FROM attendance_reports WHERE id = $1", [report.id]);
  }
  return report;
}
