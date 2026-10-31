import { randomUUID } from "node:crypto";
import type { Drill, DrillCount, DrillGrade, DrillSkill } from "@/lib/domain/drill-stats";
import { query } from "@/lib/server/portal-db";

// マネージャーの集計(2026-10-31 から)。メニューごとに、部員・スキル・評価ごとの本数を持つ。

type DrillRow = {
  id: string;
  practice_date: string;
  name: string;
  created_by: string | null;
  created_at: Date | string;
};

type CountRow = {
  drill_id: string;
  member_id: string;
  skill: DrillSkill;
  grade: DrillGrade;
  count: number;
};

function toDrill(row: DrillRow): Drill {
  return {
    id: row.id,
    practiceDate: row.practice_date,
    name: row.name,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toCount(row: CountRow): DrillCount {
  return {
    drillId: row.drill_id,
    memberId: row.member_id,
    skill: row.skill,
    grade: row.grade,
    count: Number(row.count),
  };
}

export async function createDrill(input: {
  teamSlug: string;
  practiceDate: string;
  name: string;
  createdBy: string;
}): Promise<Drill> {
  const rows = await query<DrillRow>(
    `INSERT INTO drill_stat_drills (id, team_slug, practice_date, name, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, practice_date, name, created_by, created_at`,
    [randomUUID(), input.teamSlug, input.practiceDate, input.name, input.createdBy],
  );
  return toDrill(rows[0]);
}

/** そのチームのメニュー(新しい日から)。 */
export async function listDrills(teamSlug: string, limit = 60): Promise<Drill[]> {
  const rows = await query<DrillRow>(
    `SELECT id, practice_date, name, created_by, created_at FROM drill_stat_drills
     WHERE team_slug = $1 ORDER BY practice_date DESC, created_at DESC LIMIT $2`,
    [teamSlug, limit],
  );
  return rows.map(toDrill);
}

export async function getDrill(teamSlug: string, drillId: string): Promise<Drill | null> {
  const rows = await query<DrillRow>(
    `SELECT id, practice_date, name, created_by, created_at FROM drill_stat_drills
     WHERE team_slug = $1 AND id = $2`,
    [teamSlug, drillId],
  );
  return rows[0] ? toDrill(rows[0]) : null;
}

/** メニューを消す(本数も一緒に消える)。 */
export async function deleteDrill(teamSlug: string, drillId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM drill_stat_drills WHERE team_slug = $1 AND id = $2 RETURNING id",
    [teamSlug, drillId],
  );
  return rows.length > 0;
}

export async function listDrillCounts(drillId: string): Promise<DrillCount[]> {
  const rows = await query<CountRow>(
    "SELECT drill_id, member_id, skill, grade, count FROM drill_stat_counts WHERE drill_id = $1 AND count > 0",
    [drillId],
  );
  return rows.map(toCount);
}

/** 本数を1つ増やす・減らす(0より下にはしない)。変えたあとの本数を返す。 */
export async function addDrillCount(input: {
  drillId: string;
  memberId: string;
  skill: DrillSkill;
  grade: DrillGrade;
  delta: 1 | -1;
}): Promise<number> {
  const rows = await query<{ count: number }>(
    `INSERT INTO drill_stat_counts (drill_id, member_id, skill, grade, count)
     VALUES ($1, $2, $3, $4, GREATEST($5, 0))
     ON CONFLICT (drill_id, member_id, skill, grade) DO UPDATE SET
       count = GREATEST(drill_stat_counts.count + $5, 0), updated_at = now()
     RETURNING count`,
    [input.drillId, input.memberId, input.skill, input.grade, input.delta],
  );
  return Number(rows[0]?.count ?? 0);
}

/** その日から今日までの、全部のメニューの本数の合計(部員・スキル・評価ごと)。 */
export async function sumDrillCounts(teamSlug: string, from: string): Promise<Omit<DrillCount, "drillId">[]> {
  const rows = await query<Omit<CountRow, "drill_id">>(
    `SELECT c.member_id, c.skill, c.grade, sum(c.count)::int AS count
     FROM drill_stat_counts c JOIN drill_stat_drills d ON d.id = c.drill_id
     WHERE d.team_slug = $1 AND d.practice_date >= $2
     GROUP BY c.member_id, c.skill, c.grade`,
    [teamSlug, from],
  );
  return rows.map((row) => ({
    memberId: row.member_id,
    skill: row.skill,
    grade: row.grade,
    count: Number(row.count),
  }));
}

/** メニューごとの本数の合計(一覧に出す)。 */
export async function countDrillTotals(teamSlug: string): Promise<Map<string, number>> {
  const rows = await query<{ drill_id: string; total: number }>(
    `SELECT c.drill_id, sum(c.count)::int AS total
     FROM drill_stat_counts c JOIN drill_stat_drills d ON d.id = c.drill_id
     WHERE d.team_slug = $1 GROUP BY c.drill_id`,
    [teamSlug],
  );
  return new Map(rows.map((row) => [row.drill_id, Number(row.total)]));
}
