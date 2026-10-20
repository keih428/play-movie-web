import {
  estimate1rm,
  topSetKg,
  type Estimated1rm,
  type Measurement,
  type MeasurementItem,
  type SessionExercise,
  type TrainingMenu,
  type TrainingPlan,
  type TrainingProgram,
  type TrainingSessionRecord,
} from "@/lib/domain/training";
import { query } from "@/lib/server/portal-db";

export type TeamSession = TrainingSessionRecord & { memberId: string };

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

type SessionRow = {
  member_id: string;
  date: string;
  exercises: SessionExercise[] | string;
  body_weight_kg: number | null;
  memo: string;
  request: string;
  updated_at: Date | string;
};

const SESSION_COLUMNS = "s.member_id, s.date, s.exercises, s.body_weight_kg, s.memo, s.request, s.updated_at";

function toSession(row: SessionRow): TeamSession {
  return {
    memberId: row.member_id,
    date: row.date,
    // PGlite と pg で、jsonb が文字で返ることがある。
    exercises: typeof row.exercises === "string" ? (JSON.parse(row.exercises) as SessionExercise[]) : row.exercises,
    bodyWeightKg: row.body_weight_kg,
    memo: row.memo,
    request: row.request,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** 自分の記録を、新しい日付から順に。 */
export async function listMemberSessions(memberId: string, limit = 120): Promise<TrainingSessionRecord[]> {
  const rows = await query<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM training_sessions s WHERE s.member_id = $1 ORDER BY s.date DESC LIMIT $2`,
    [memberId, limit],
  );
  return rows.map(toSession);
}

/** 種目ごとの、いちばん新しい記録の一番重いセット(記録の欄に、前回の重さとして入れておく)。 */
export function getLatestKgByExercise(sessions: TrainingSessionRecord[]): Record<string, number> {
  const latest: Record<string, number> = {};
  // sessions は新しい順。先に見つかったものがいちばん新しい。
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const kg = topSetKg(exercise);
      if (kg !== null && latest[exercise.name] === undefined) {
        latest[exercise.name] = kg;
      }
    }
  }
  return latest;
}

/** その日の記録に書いてある「トレーニング担当へ」。変わったときだけ知らせるために使う。 */
export async function getSessionRequest(memberId: string, date: string): Promise<string> {
  const rows = await query<{ request: string }>(
    "SELECT request FROM training_sessions WHERE member_id = $1 AND date = $2",
    [memberId, date],
  );
  return rows[0]?.request ?? "";
}

/** その日の記録を、送られてきた内容で置き換える(1人・1日に1つ)。 */
export async function saveSession(
  memberId: string,
  record: Omit<TrainingSessionRecord, "updatedAt">,
) {
  await query(
    `INSERT INTO training_sessions (member_id, date, exercises, body_weight_kg, memo, request)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (member_id, date) DO UPDATE SET
       exercises = EXCLUDED.exercises, body_weight_kg = EXCLUDED.body_weight_kg,
       memo = EXCLUDED.memo, request = EXCLUDED.request, updated_at = now()`,
    [memberId, record.date, JSON.stringify(record.exercises), record.bodyWeightKg, record.memo, record.request],
  );
}

export async function deleteSession(memberId: string, date: string): Promise<boolean> {
  const rows = await query<{ date: string }>(
    "DELETE FROM training_sessions WHERE member_id = $1 AND date = $2 RETURNING date",
    [memberId, date],
  );
  return rows.length > 0;
}

/** チームの、from〜to の記録(新しく書き直された順)。みんなの記録に使う。 */
export async function listTeamSessions(teamSlug: string, from: string, to: string): Promise<TeamSession[]> {
  const rows = await query<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM training_sessions s
     JOIN members m ON m.id = s.member_id
     WHERE m.team_slug = $1 AND s.date BETWEEN $2 AND $3
     ORDER BY s.updated_at DESC`,
    [teamSlug, from, to],
  );
  return rows.map(toSession);
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
