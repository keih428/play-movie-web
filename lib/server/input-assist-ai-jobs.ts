import {
  AI_JOB_LEASE_MS,
  aiJobSetStates,
  buildAiJobSets,
  decideSetApply,
  mergeSkeletonSets,
  skeletonRalliesForSet,
  skeletonSetIndexes,
  type IaAiJobApplied,
  type IaAiJobClaim,
  type IaAiJobSet,
  type IaAiJobStatus,
  type IaAiJobSummary,
} from "@/lib/domain/input-assist/ai-job";
import type { IaP0Data, IaP1Data, IaPlayFieldsData } from "@/lib/domain/input-assist/collab";
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
// スタッフが依頼を作り(createAiJob)、係が claim で受け取り、progress・partial・result・fail を送る。
// partial(セットごとの途中の結果)は partial の列に、セットごとにまとめて持つ。届いたセットから自動で入れる。

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
  partial: unknown;
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
  const summary: IaAiJobSummary = {
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
    // できたら result。解析中は、届いたセットぶん(partial)
    skeleton: parseJson<IaSkeleton>(row.result) ?? parseJson<IaSkeleton>(row.partial),
    resultMeta: parseJson<Record<string, unknown>>(row.result_meta),
    applied: parseJson<IaAiJobApplied>(row.applied),
    setStates: [],
  };
  summary.setStates = aiJobSetStates(summary);
  return summary;
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

function parseSkeletonInput(value: unknown): { skeleton: IaSkeleton } | AiJobError {
  try {
    return { skeleton: parseSkeleton(JSON.stringify(value ?? null)) };
  } catch (error) {
    return { error: error instanceof SkeletonError ? error.message : "骨組みが読めません。", status: 400 };
  }
}

async function notRunningError(jobId: string): Promise<AiJobError> {
  const exists = await query<{ status: string }>("SELECT status FROM input_assist_ai_jobs WHERE id = $1", [jobId]);
  return exists[0]
    ? { error: `この依頼は、もう${exists[0].status === "done" ? "できています" : "受け取っていません"}。`, status: 409 }
    : { error: "依頼が見つかりません。", status: 404 };
}

/**
 * セットごとの途中の結果 {skeleton}(1セット以上の、解析し終えたセットのラリー)。解析中の依頼だけ。
 * 形を確かめ、届いたセットを partial に入れ替えてまとめ、受け取った時刻を新しくする(30 分の期限を延ばす)。
 * そのセットだけ、result と同じ決まりで自動で入れる。同じ中身をもう一度送っても、二重には入らない。
 */
export async function reportAiJobPartial(
  jobId: string,
  input: { skeleton?: unknown },
  now: Date = new Date(),
): Promise<{ applied: IaAiJobApplied; sets: number[] } | AiJobError> {
  if (!isJobId(jobId)) {
    return { error: "依頼が見つかりません。", status: 404 };
  }
  const parsed = parseSkeletonInput(input.skeleton);
  if ("error" in parsed) {
    return parsed;
  }
  const sets = skeletonSetIndexes(parsed.skeleton);
  if (sets.length === 0) {
    return { error: "ラリーがありません。", status: 400 };
  }
  const rows = await query<JobRow>(
    `UPDATE input_assist_ai_jobs SET leased_at = $2::timestamptz, updated_at = now()
     WHERE id = $1 AND status = 'running' RETURNING *`,
    [jobId, now.toISOString()],
  );
  const row = rows[0];
  if (!row) {
    return notRunningError(jobId);
  }
  const previous = parseJson<IaSkeleton>(row.partial);
  const applied = await applySkeletonSets(row.team_slug, row.session_id, jobId, parsed.skeleton, sets, {
    skeleton: previous,
    applied: parseJson<IaAiJobApplied>(row.applied),
  });
  await query(
    `UPDATE input_assist_ai_jobs SET partial = $2::jsonb, applied = $3::jsonb, updated_at = now()
     WHERE id = $1 AND status = 'running'`,
    [jobId, JSON.stringify(mergeSkeletonSets(previous, parsed.skeleton)), JSON.stringify(applied)],
  );
  return { applied, sets };
}

/**
 * 骨組みが届いた(全部のセット)。形を確かめて保存し、ラリーが空のセットには自動で入れる(P0 のスライスとして保存。出どころは auto)。
 * ラリーが入っているセットは入れない(画面で「入れ替える」)。
 * 途中の結果(partial)で同じ中身を入れてあるセットは、もう一度は入れない。途中の結果にしかないセットも残す。
 */
export async function completeAiJob(
  jobId: string,
  input: { skeleton?: unknown; meta?: unknown },
): Promise<{ applied: IaAiJobApplied } | AiJobError> {
  if (!isJobId(jobId)) {
    return { error: "依頼が見つかりません。", status: 404 };
  }
  const parsed = parseSkeletonInput(input.skeleton);
  if ("error" in parsed) {
    return parsed;
  }
  const meta = input.meta && typeof input.meta === "object" && !Array.isArray(input.meta) ? input.meta : {};
  const rows = await query<JobRow>(
    `UPDATE input_assist_ai_jobs SET status = 'done', result_meta = $2::jsonb,
       progress_percent = 100, finished_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'running' RETURNING *`,
    [jobId, JSON.stringify(meta)],
  );
  const row = rows[0];
  if (!row) {
    return notRunningError(jobId);
  }
  const previous = parseJson<IaSkeleton>(row.partial);
  const skeleton = mergeSkeletonSets(previous, parsed.skeleton);
  const applied = await applySkeletonSets(
    row.team_slug,
    row.session_id,
    jobId,
    parsed.skeleton,
    skeletonSetIndexes(parsed.skeleton),
    { skeleton: previous, applied: parseJson<IaAiJobApplied>(row.applied) },
  );
  await query("UPDATE input_assist_ai_jobs SET result = $2::jsonb, applied = $3::jsonb, updated_at = now() WHERE id = $1", [
    jobId,
    JSON.stringify(skeleton),
    JSON.stringify(applied),
  ]);
  return { applied };
}

function laterPassesEmpty(slices: Array<{ setIndex: number; pass: string; data: unknown }>, setIndex: number): boolean {
  return slices
    .filter((slice) => slice.setIndex === setIndex && slice.pass !== "P0")
    .every((slice) => {
      const data = (slice.data ?? {}) as Partial<IaP1Data> & Partial<IaPlayFieldsData>;
      const entries = slice.pass === "P1" ? data.rallies : data.plays;
      return !entries || Object.keys(entries).length === 0;
    });
}

/**
 * 骨組みの、指定したセットを入れる(交代・タイムアウトは残す)。返すのは、この依頼でこれまでに入れた・待たせたセットの全部。
 * - 前に同じ中身を入れてある → そのまま(入れた)
 * - ラリーが空、または前にこの依頼で入れたラリーが人の手が入らないまま残っている → 入れる
 * - 人がラリーを入れている → 入れない(入れ替え待ち)
 * - 試合にない・打たないセット → 入れない(どちらにも数えない)
 */
export async function applySkeletonSets(
  teamSlug: string,
  sessionId: string,
  jobId: string,
  skeleton: IaSkeleton,
  setIndexes: number[],
  previous: { skeleton: IaSkeleton | null; applied: IaAiJobApplied | null } = { skeleton: null, applied: null },
): Promise<IaAiJobApplied> {
  const appliedSets = new Set(previous.applied?.applied ?? []);
  const waitingSets = new Set(previous.applied?.waiting ?? []);
  const finish = (): IaAiJobApplied => ({
    applied: [...appliedSets].sort((left, right) => left - right),
    waiting: [...waitingSets].sort((left, right) => left - right),
  });
  const bundle = await loadInputAssistBundle(teamSlug, sessionId);
  if (!bundle) {
    return finish();
  }
  const previousSets = new Set(skeletonSetIndexes(previous.skeleton));
  for (const setIndex of setIndexes) {
    const outcome = appliedSets.has(setIndex) ? "applied" : waitingSets.has(setIndex) ? "waiting" : null;
    appliedSets.delete(setIndex);
    waitingSets.delete(setIndex);
    const set = bundle.meta.sets.find((entry) => entry.setIndex === setIndex);
    if (!set || set.skipped) {
      continue;
    }
    const current = bundle.slices.find((slice) => slice.setIndex === setIndex && slice.pass === "P0");
    const data = (current?.data as IaP0Data | undefined) ?? { rallies: [], substitutions: [], timeouts: [] };
    const next = skeletonRalliesForSet(skeleton, setIndex, jobId);
    const decision = decideSetApply({
      next,
      previous: previous.skeleton && previousSets.has(setIndex) ? skeletonRalliesForSet(previous.skeleton, setIndex, jobId) : null,
      previousOutcome: outcome,
      current: data.rallies ?? [],
      laterPassesEmpty: laterPassesEmpty(bundle.slices, setIndex),
    });
    if (decision === "skip") {
      appliedSets.add(setIndex);
      continue;
    }
    if (decision === "ask") {
      waitingSets.add(setIndex);
      continue;
    }
    const saved = await saveInputAssistSlice(
      teamSlug,
      sessionId,
      setIndex,
      "P0",
      { rallies: next, substitutions: data.substitutions ?? [], timeouts: data.timeouts ?? [] },
      current?.version ?? 0,
      AI_MEMBER,
    );
    // そのあいだに人がラリーを入れていたら、入れない(画面で「入れ替える」)
    (saved?.ok ? appliedSets : waitingSets).add(setIndex);
  }
  return finish();
}
