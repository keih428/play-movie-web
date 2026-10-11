import {
  estimate1rm,
  type Estimated1rm,
  type LiftKind,
  type Measurement,
  type MeasurementItem,
  type TrainingDay,
  type TrainingMenu,
  type TrainingPlan,
  type TrainingProgram,
} from "@/lib/domain/training";
import { query, transaction } from "@/lib/server/portal-db";

export type DayRecord = {
  weights: Record<string, number>;
  memo: string;
  request: string;
  saved: boolean;
};

export type WeekRecords = Partial<Record<TrainingDay, DayRecord>>;

export type TeamLiftLog = {
  memberId: string;
  lift: LiftKind;
  weightKg: number;
};

export type TeamMemo = {
  memberId: string;
  day: TrainingDay;
  memo: string;
  request: string;
  updatedAt: string;
};

/** 日本時間の今日('YYYY-MM-DD')。 */
export function getTodayInJapan(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

/** 登録してあるメニューを、期間の古い順に。 */
export async function listTrainingPrograms(teamSlug: string): Promise<TrainingProgram[]> {
  const rows = await query<{ start_date: string; data: TrainingMenu }>(
    "SELECT start_date, data FROM training_programs WHERE team_slug = $1 ORDER BY start_date",
    [teamSlug],
  );
  return rows.map((row) => ({ key: row.start_date, menu: row.data }));
}

/** 最初の週の開始日が同じメニューがあれば入れ替え、なければ足す。 */
export async function saveTrainingProgram(teamSlug: string, menu: TrainingMenu, updatedBy: string) {
  await query(
    `INSERT INTO training_programs (team_slug, start_date, data, updated_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (team_slug, start_date) DO UPDATE SET
       data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [teamSlug, menu.weeks[0].s, JSON.stringify(menu), updatedBy],
  );
}

/** メニューだけを消す。部員の記録は残る。 */
export async function deleteTrainingProgram(teamSlug: string, key: string): Promise<boolean> {
  const rows = await query(
    "DELETE FROM training_programs WHERE team_slug = $1 AND start_date = $2 RETURNING start_date",
    [teamSlug, key],
  );
  return rows.length > 0;
}

export async function getTrainingPlan(teamSlug: string): Promise<TrainingPlan | null> {
  const rows = await query<{ data: TrainingPlan }>(
    "SELECT data FROM training_plans WHERE team_slug = $1",
    [teamSlug],
  );
  return rows[0]?.data ?? null;
}

export async function saveTrainingPlan(teamSlug: string, plan: TrainingPlan, updatedBy: string) {
  await query(
    `INSERT INTO training_plans (team_slug, data, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (team_slug) DO UPDATE SET
       data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [teamSlug, JSON.stringify(plan), updatedBy],
  );
}

export async function getWeekRecords(memberId: string, weekStart: string): Promise<WeekRecords> {
  const [logs, memos] = await Promise.all([
    query<{ day: TrainingDay; exercise: string; weight_kg: number }>(
      "SELECT day, exercise, weight_kg FROM training_logs WHERE member_id = $1 AND week_start = $2",
      [memberId, weekStart],
    ),
    query<{ day: TrainingDay; memo: string; request: string }>(
      "SELECT day, memo, request FROM training_memos WHERE member_id = $1 AND week_start = $2",
      [memberId, weekStart],
    ),
  ]);

  const records: WeekRecords = {};
  for (const memo of memos) {
    records[memo.day] = { weights: {}, memo: memo.memo, request: memo.request, saved: true };
  }
  for (const log of logs) {
    const record = (records[log.day] ??= { weights: {}, memo: "", request: "", saved: true });
    record.weights[log.exercise] = log.weight_kg;
  }
  return records;
}

/** 種目ごとの、この週より前でいちばん新しい重さ(「先週の重さ」として欄に入れておく)。 */
export async function getPreviousWeights(
  memberId: string,
  weekStart: string,
): Promise<Record<string, number>> {
  const rows = await query<{ exercise: string; weight_kg: number }>(
    `SELECT DISTINCT ON (exercise) exercise, weight_kg FROM training_logs
     WHERE member_id = $1 AND week_start < $2
     ORDER BY exercise, week_start DESC`,
    [memberId, weekStart],
  );
  return Object.fromEntries(rows.map((row) => [row.exercise, row.weight_kg]));
}

/** その日の記録を、送られてきた内容で置き換える。空の欄の種目は消える。 */
export async function saveDayRecord(input: {
  memberId: string;
  weekStart: string;
  day: TrainingDay;
  weights: { exercise: string; lift: LiftKind | null; weightKg: number }[];
  memo: string;
  request: string;
}) {
  await transaction(async (run) => {
    await run("DELETE FROM training_logs WHERE member_id = $1 AND week_start = $2 AND day = $3", [
      input.memberId,
      input.weekStart,
      input.day,
    ]);
    for (const weight of input.weights) {
      await run(
        `INSERT INTO training_logs (member_id, week_start, day, exercise, lift, weight_kg)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.memberId, input.weekStart, input.day, weight.exercise, weight.lift, weight.weightKg],
      );
    }
    await run(
      `INSERT INTO training_memos (member_id, week_start, day, memo, request)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (member_id, week_start, day) DO UPDATE SET
         memo = EXCLUDED.memo, request = EXCLUDED.request, updated_at = now()`,
      [input.memberId, input.weekStart, input.day, input.memo, input.request],
    );
  });
}

type MeasurementRow = {
  member_id: string;
  item: MeasurementItem;
  value: number;
  rm: number | null;
  measured_on: string;
};

function toLatest(rows: MeasurementRow[]): Map<string, Partial<Record<MeasurementItem, Measurement>>> {
  const latest = new Map<string, Partial<Record<MeasurementItem, Measurement>>>();
  for (const row of rows) {
    const entry = latest.get(row.member_id) ?? {};
    entry[row.item] = { item: row.item, value: row.value, rm: row.rm, measuredOn: row.measured_on };
    latest.set(row.member_id, entry);
  }
  return latest;
}

const LATEST_MEASUREMENTS_SQL = `
  SELECT DISTINCT ON (ms.member_id, ms.item) ms.member_id, ms.item, ms.value, ms.rm, ms.measured_on
  FROM measurements ms`;

/** 項目ごと(体重・スクワット・DL・ベンチ)の、いちばん新しい測定。 */
export async function getLatestMeasurements(
  memberId: string,
): Promise<Partial<Record<MeasurementItem, Measurement>>> {
  const rows = await query<MeasurementRow>(
    `${LATEST_MEASUREMENTS_SQL} WHERE ms.member_id = $1
     ORDER BY ms.member_id, ms.item, ms.measured_on DESC`,
    [memberId],
  );
  return toLatest(rows).get(memberId) ?? {};
}

export async function getTeamLatestMeasurements(teamSlug: string) {
  const rows = await query<MeasurementRow>(
    `${LATEST_MEASUREMENTS_SQL} JOIN members m ON m.id = ms.member_id
     WHERE m.team_slug = $1
     ORDER BY ms.member_id, ms.item, ms.measured_on DESC`,
    [teamSlug],
  );
  return toLatest(rows);
}

export function toEstimated1rm(
  latest: Partial<Record<MeasurementItem, Measurement>>,
): Estimated1rm {
  const estimated: Estimated1rm = {};
  for (const lift of ["sq", "dl", "bp"] as const) {
    const measurement = latest[lift];
    if (measurement) {
      estimated[lift] = estimate1rm(measurement);
    }
  }
  return estimated;
}

export async function saveMeasurements(
  memberId: string,
  measuredOn: string,
  items: { item: MeasurementItem; value: number; rm: number | null }[],
) {
  for (const entry of items) {
    await query(
      `INSERT INTO measurements (member_id, measured_on, item, value, rm)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (member_id, measured_on, item) DO UPDATE SET
         value = EXCLUDED.value, rm = EXCLUDED.rm, updated_at = now()`,
      [memberId, measuredOn, entry.item, entry.value, entry.rm],
    );
  }
}

export async function getTeamWeek(
  teamSlug: string,
  weekStart: string,
): Promise<{ lifts: TeamLiftLog[]; memos: TeamMemo[] }> {
  const [lifts, memos] = await Promise.all([
    query<{ member_id: string; lift: LiftKind; weight_kg: number }>(
      `SELECT l.member_id, l.lift, l.weight_kg FROM training_logs l
       JOIN members m ON m.id = l.member_id
       WHERE m.team_slug = $1 AND l.week_start = $2 AND l.lift IS NOT NULL`,
      [teamSlug, weekStart],
    ),
    query<{ member_id: string; day: TrainingDay; memo: string; request: string; updated_at: Date }>(
      `SELECT t.member_id, t.day, t.memo, t.request, t.updated_at FROM training_memos t
       JOIN members m ON m.id = t.member_id
       WHERE m.team_slug = $1 AND t.week_start = $2
       ORDER BY t.updated_at DESC`,
      [teamSlug, weekStart],
    ),
  ]);

  return {
    lifts: lifts.map((row) => ({ memberId: row.member_id, lift: row.lift, weightKg: row.weight_kg })),
    memos: memos.map((row) => ({
      memberId: row.member_id,
      day: row.day,
      memo: row.memo,
      request: row.request,
      updatedAt: row.updated_at.toISOString(),
    })),
  };
}
