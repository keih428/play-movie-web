import {
  AI_JOB_LEASE_MS,
  buildAiJobSets,
  planSkeletonApply,
  skeletonRalliesForSet,
  type IaAiJobApplied,
  type IaAiJobClaim,
  type IaAiJobSet,
  type IaAiJobStatus,
  type IaAiJobSummary,
} from "@/lib/domain/input-assist/ai-job";
import type { IaP0Data } from "@/lib/domain/input-assist/collab";
import { createObjectId } from "@/lib/domain/input-assist/ids";
import { parseSkeleton, SkeletonError } from "@/lib/domain/input-assist/skeleton";
import type { IaSkeleton } from "@/lib/domain/input-assist/types";
import {
  ensureInputAssistMigrated,
  loadInputAssistBundle,
  saveInputAssistSlice,
} from "@/lib/server/input-assist-store";
import { query } from "@/lib/server/portal-db";

// 「AI に骨組みを頼む」の依頼(データベースの input_assist_ai_jobs)。
// スタッフが依頼を作り(createAiJob)、係が claim で受け取り、progress・result・fail を送る。

/** 骨組みを自動で入れたときの、保存した人の名前。 */
export const AI_MEMBER = { id: "ai-worker", displayName: "AI" };

const MESSAGE_MAX = 200;
const ERROR_MAX = 500;

type JobRow = {
  id: string;
  session_id: string;
  team_slug: string;
  status: string;
  sets: unknown;
  progress_message: string | null;
  progress_percent: number | string | null;
  result: unknown;
  result_meta: unknown;
  applied: unknown;
  error: string | null;
  created_by_name: string | null;
  created_at: unknown;
  leased_at: unknown;
  finished_at: unknown;
};

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function toSummary(row: JobRow): IaAiJobSummary {
  const percent = row.progress_percent === null ? null : Number(row.progress_percent);
  return {
    id: row.id,
    status: row.status as IaAiJobStatus,
    sets: parseJson<IaAiJobSet[]>(row.sets) ?? [],
    progressMessage: row.progress_message,
    progressPercent: percent !== null && Number.isFinite(percent) ? percent : null,
    error: row.error,
    createdAt: toIso(row.created_at),
    createdByName: row.created_by_name,
    leasedAt: toIso(row.leased_at),
    finishedAt: toIso(row.finished_at),
    skeleton: parseJson<IaSkeleton>(row.result),
    resultMeta: parseJson<Record<string, unknown>>(row.result_meta),
    applied: parseJson<IaAiJobApplied>(row.applied),
  };
}

export type AiJobError = { error: string; status: number };

// ---- スタッフ ----

/** 今の準備から依頼を作る。同じ試合の依頼が待ち・解析中なら作らない。 */
export async function createAiJob(
  teamSlug: string,
  sessionId: string,
  member: { id: string; displayName: string },
): Promise<{ job: IaAiJobSummary } | AiJobError> {
  const meta = await ensureInputAssistMigrated(teamSlug, sessionId);
  if (!meta) {
    return { error: "試合が見つかりません。", status: 404 };
  }
  const built = buildAiJobSets(meta.sets);
  if (built.error !== undefined) {
    return { error: built.error, status: 400 };
  }
  const open = await query<{ id: string }>(
    `SELECT id FROM input_assist_ai_jobs
     WHERE session_id = $1 AND team_slug = $2 AND status IN ('pending', 'running') LIMIT 1`,
    [sessionId, teamSlug],
  );
  if (open.length > 0) {
    return { error: "もう頼んでいます。できるまで待ってください。", status: 409 };
  }
  const rows = await query<JobRow>(
    `INSERT INTO input_assist_ai_jobs (id, session_id, team_slug, status, sets, created_by, created_by_name)
     VALUES ($1, $2, $3, 'pending', $4::jsonb, $5, $6) RETURNING *`,
    [createObjectId(), sessionId, teamSlug, JSON.stringify(built.sets), member.id, member.displayName],
  );
  return { job: toSummary(rows[0]) };
}

/** その試合の依頼(新しい順)。 */
export async function listAiJobs(teamSlug: string, sessionId: string, limit = 5): Promise<IaAiJobSummary[]> {
  const rows = await query<JobRow>(
    `SELECT * FROM input_assist_ai_jobs WHERE session_id = $1 AND team_slug = $2
     ORDER BY created_at DESC, id DESC LIMIT $3`,
    [sessionId, teamSlug, limit],
  );
  return rows.map(toSummary);
}

// ---- 係 ----

/**
 * 一番古い「待ち」(か、解析中のまま 30 分なにも送ってこないもの)を1つ受け取り、解析中にする。なければ null。
 * 同時に2つの係が呼んでも、同じ依頼は1つにしか渡さない(FOR UPDATE SKIP LOCKED)。
 */
export async function claimAiJob(now: Date = new Date()): Promise<IaAiJobClaim | null> {
  const expiredBefore = new Date(now.getTime() - AI_JOB_LEASE_MS).toISOString();
  const rows = await query<JobRow>(
    `UPDATE input_assist_ai_jobs SET status = 'running', leased_at = $1::timestamptz, attempts = attempts + 1,
       progress_message = NULL, progress_percent = NULL, updated_at = now()
     WHERE id = (
       SELECT id FROM input_assist_ai_jobs
       WHERE status = 'pending' OR (status = 'running' AND (leased_at IS NULL OR leased_at < $2::timestamptz))
       ORDER BY created_at, id
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [now.toISOString(), expiredBefore],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    jobId: row.id,
    sessionId: row.session_id,
    teamSlug: row.team_slug,
    sets: parseJson<IaAiJobSet[]>(row.sets) ?? [],
  };
}

function isJobId(value: string) {
  return /^[0-9a-f]{24}$/.test(value);
}

/** 進み具合。解析中のものだけ受け取る(受け取った時刻も新しくする = 30 分の期限を延ばす)。 */
export async function reportAiJobProgress(
  jobId: string,
  input: { message?: unknown; percent?: unknown },
  now: Date = new Date(),
): Promise<boolean> {
  if (!isJobId(jobId)) {
    return false;
  }
  const percent = Number(input.percent);
  const rows = await query(
    `UPDATE input_assist_ai_jobs SET progress_message = $2, progress_percent = $3, leased_at = $4::timestamptz,
       updated_at = now()
     WHERE id = $1 AND status = 'running' RETURNING id`,
    [
      jobId,
      typeof input.message === "string" ? input.message.slice(0, MESSAGE_MAX) : null,
      Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null,
      now.toISOString(),
    ],
  );
  return rows.length > 0;
}

/** 失敗。解析中のものだけ。 */
export async function failAiJob(jobId: string, error: unknown): Promise<boolean> {
  if (!isJobId(jobId)) {
    return false;
  }
  const rows = await query(
    `UPDATE input_assist_ai_jobs SET status = 'failed', error = $2, finished_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'running' RETURNING id`,
    [jobId, (typeof error === "string" && error.trim() ? error.trim() : "理由が分かりません").slice(0, ERROR_MAX)],
  );
  return rows.length > 0;
}

/**
 * 骨組みが届いた。形を確かめて保存し、ラリーが空のセットには自動で入れる(P0 のスライスとして保存。出どころは auto)。
 * ラリーが入っているセットは入れない(画面で「入れ替える」)。
 */
export async function completeAiJob(
  jobId: string,
  input: { skeleton?: unknown; meta?: unknown },
): Promise<{ applied: IaAiJobApplied } | AiJobError> {
  if (!isJobId(jobId)) {
    return { error: "依頼が見つかりません。", status: 404 };
  }
  let skeleton: IaSkeleton;
  try {
    skeleton = parseSkeleton(JSON.stringify(input.skeleton ?? null));
  } catch (error) {
    return { error: error instanceof SkeletonError ? error.message : "骨組みが読めません。", status: 400 };
  }
  const meta = input.meta && typeof input.meta === "object" && !Array.isArray(input.meta) ? input.meta : {};
  const rows = await query<JobRow>(
    `UPDATE input_assist_ai_jobs SET status = 'done', result = $2::jsonb, result_meta = $3::jsonb,
       progress_percent = 100, finished_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'running' RETURNING *`,
    [jobId, JSON.stringify(skeleton), JSON.stringify(meta)],
  );
  const row = rows[0];
  if (!row) {
    const exists = await query<{ status: string }>("SELECT status FROM input_assist_ai_jobs WHERE id = $1", [jobId]);
    return exists[0]
      ? { error: `この依頼は、もう${exists[0].status === "done" ? "できています" : "受け取っていません"}。`, status: 409 }
      : { error: "依頼が見つかりません。", status: 404 };
  }
  const applied = await applySkeletonToEmptySets(row.team_slug, row.session_id, jobId, skeleton);
  await query("UPDATE input_assist_ai_jobs SET applied = $2::jsonb, updated_at = now() WHERE id = $1", [
    jobId,
    JSON.stringify(applied),
  ]);
  return { applied };
}

/** ラリーが空のセットに、骨組みのラリーを入れる(交代・タイムアウトは残す)。 */
export async function applySkeletonToEmptySets(
  teamSlug: string,
  sessionId: string,
  jobId: string,
  skeleton: IaSkeleton,
): Promise<IaAiJobApplied> {
  const bundle = await loadInputAssistBundle(teamSlug, sessionId);
  if (!bundle) {
    return { applied: [], waiting: [] };
  }
  const p0Of = (setIndex: number) =>
    bundle.slices.find((slice) => slice.setIndex === setIndex && slice.pass === "P0");
  const plan = planSkeletonApply(
    skeleton,
    bundle.meta.sets.map((set) => ({
      setIndex: set.setIndex,
      skipped: set.skipped,
      rallyCount: ((p0Of(set.setIndex)?.data as IaP0Data | undefined)?.rallies ?? []).length,
    })),
  );
  const result: IaAiJobApplied = { applied: [], waiting: [...plan.ask] };
  for (const setIndex of plan.apply) {
    const current = p0Of(setIndex);
    const data = (current?.data as IaP0Data | undefined) ?? { rallies: [], substitutions: [], timeouts: [] };
    const saved = await saveInputAssistSlice(
      teamSlug,
      sessionId,
      setIndex,
      "P0",
      {
        rallies: skeletonRalliesForSet(skeleton, setIndex, jobId),
        substitutions: data.substitutions ?? [],
        timeouts: data.timeouts ?? [],
      },
      current?.version ?? 0,
      AI_MEMBER,
    );
    // そのあいだに人がラリーを入れていたら、入れない(画面で「入れ替える」)
    if (saved?.ok) {
      result.applied.push(setIndex);
    } else {
      result.waiting.push(setIndex);
    }
  }
  result.waiting.sort((left, right) => left - right);
  return result;
}
