import {
  IA_PASSES,
  composeSession,
  countRalliesInSlice,
  emptySliceData,
  isSplitDocument,
  metaFromDocument,
  metaOf,
  migrateLegacySession,
  parseSliceKey,
  sliceKey,
  type IaSliceData,
  type IaSliceDataMap,
  type IaSliceRecord,
  type IaSliceVersion,
  type InputAssistMeta,
} from "@/lib/domain/input-assist/collab";

export type { InputAssistBundle, InputAssistSyncState };
import type {
  IaAssignment,
  IaPassSeconds,
  InputAssistBundle,
  InputAssistSyncState,
} from "@/lib/domain/input-assist/board";
import { PRESENCE_STALE_MS } from "@/lib/domain/input-assist/board";
import { createObjectId } from "@/lib/domain/input-assist/ids";
import {
  isIsoDateString,
  normalizeSets,
  normalizeTeam,
  summarizeSession,
} from "@/lib/domain/input-assist/session";
import type {
  IaMatchExtras,
  IaMatchViewerLink,
  IaPassLog,
  IaPassName,
  IaSet,
  IaTeam,
  IaTeamSide,
  InputAssistSession,
  InputAssistSessionSummary,
} from "@/lib/domain/input-assist/types";
import { readDocument, writeDocument } from "@/lib/server/document-store";
import { query, transaction } from "@/lib/server/portal-db";

// 打ち込み補助のセッション(1試合)の置き場所。
// - メタ(名前・日付・チーム・セットの準備)は、文書(手元は .data/documents、本番は Vercel Blob)に1試合1つ
// - セット × パスごとの中身(スライス)・担当・パスの時間は、データベース(手元は PGlite、本番は Postgres)
// 一覧は別の文書(index)に持ち、ラリーの数と最後に保存した時刻はデータベースから重ねる。
//
// 前の形(1試合 = 1つの文書にすべて)のセッションは、はじめて開いたときにスライスに分ける(ensureInputAssistMigrated)。
// 分ける前の文書は「-v1-backup」に写して残す。

const TITLE_MAX = 80;

function indexKey(teamSlug: string) {
  return `input-assist-${teamSlug}-index`;
}

function sessionKey(teamSlug: string, id: string) {
  return `input-assist-${teamSlug}-${id}`;
}

function backupKey(teamSlug: string, id: string) {
  return `${sessionKey(teamSlug, id)}-v1-backup`;
}

function isSessionId(value: string) {
  return /^[0-9a-f]{24}$/.test(value);
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Member = { id: string; displayName: string };
type QueryFn = typeof query;

export class InputAssistConflictError extends Error {
  constructor(readonly current: InputAssistMeta) {
    super("ほかの画面で先に保存されました。");
  }
}

type SliceRow = {
  set_index: number;
  pass: string;
  version: number;
  data?: unknown;
  updated_at: unknown;
  updated_by_name: string | null;
};

// ---- 一覧 ----

export async function listInputAssistSessions(teamSlug: string): Promise<InputAssistSessionSummary[]> {
  const index = (await readDocument<InputAssistSessionSummary[]>(indexKey(teamSlug))) ?? [];
  const counts = new Map<string, { rallyCount: number; updatedAt: string | null }>();
  try {
    const rows = await query<{ session_id: string; rally_count: number | string; updated_at: unknown }>(
      `SELECT session_id, SUM(rally_count) AS rally_count, MAX(updated_at) AS updated_at
       FROM input_assist_slices WHERE team_slug = $1 AND pass = 'P0' GROUP BY session_id`,
      [teamSlug],
    );
    for (const row of rows) {
      counts.set(row.session_id, { rallyCount: Number(row.rally_count) || 0, updatedAt: toIso(row.updated_at) });
    }
  } catch (error) {
    console.error("[input-assist] list counts failed", error);
  }
  return index
    .map((entry) => {
      const count = counts.get(entry.id);
      if (!count) {
        return entry;
      }
      return {
        ...entry,
        rallyCount: count.rallyCount,
        updatedAt: count.updatedAt && count.updatedAt > entry.updatedAt ? count.updatedAt : entry.updatedAt,
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt));
}

async function writeIndexEntry(meta: InputAssistMeta, rallyCount?: number) {
  const index = (await readDocument<InputAssistSessionSummary[]>(indexKey(meta.teamSlug))) ?? [];
  const previous = index.find((entry) => entry.id === meta.id);
  const summary: InputAssistSessionSummary = {
    ...summarizeSession(composeSession(meta, {})),
    // ラリーの数は一覧を出すときにデータベースから重ねる(ここでは前の値を残す)
    rallyCount: rallyCount ?? previous?.rallyCount ?? 0,
  };
  const next = previous ? index.map((entry) => (entry.id === meta.id ? summary : entry)) : [...index, summary];
  await writeDocument(indexKey(meta.teamSlug), next);
}

// ---- 読み込み・前の形からの移し替え ----

async function readSessionDocument(
  teamSlug: string,
  id: string,
): Promise<(InputAssistSession | InputAssistMeta) | null> {
  if (!isSessionId(id)) {
    return null;
  }
  const document = await readDocument<InputAssistSession | InputAssistMeta>(sessionKey(teamSlug, id));
  return document && document.teamSlug === teamSlug ? document : null;
}

/** スライスに分け終えた印。なければ null。metaUpdatedAt は、メタを最後に保存した時刻(メタの版として使う)。 */
async function readMarker(teamSlug: string, id: string): Promise<{ metaUpdatedAt: string | null } | null> {
  if (!isSessionId(id)) {
    return null;
  }
  const rows = await query<{ meta_updated_at: string | null }>(
    "SELECT meta_updated_at FROM input_assist_sessions WHERE session_id = $1 AND team_slug = $2",
    [id, teamSlug],
  );
  return rows[0] ? { metaUpdatedAt: rows[0].meta_updated_at } : null;
}

async function isMigrated(teamSlug: string, id: string): Promise<boolean> {
  return (await readMarker(teamSlug, id)) !== null;
}

async function insertSlices(
  run: QueryFn,
  meta: Pick<InputAssistMeta, "id" | "teamSlug" | "createdBy">,
  slices: IaSliceDataMap,
  memberName: string | null,
) {
  for (const [key, data] of Object.entries(slices)) {
    const parsed = parseSliceKey(key);
    if (!parsed) {
      continue;
    }
    await run(
      `INSERT INTO input_assist_slices
         (session_id, team_slug, set_index, pass, version, data, rally_count, updated_by, updated_by_name)
       VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6, $7, $8)
       ON CONFLICT (session_id, set_index, pass) DO NOTHING`,
      [
        meta.id,
        meta.teamSlug,
        parsed.setIndex,
        parsed.pass,
        JSON.stringify(data),
        parsed.pass === "P0" ? countRalliesInSlice(data) : 0,
        meta.createdBy ?? null,
        memberName,
      ],
    );
  }
}

/**
 * スライスに分けてあることを確かめ、メタを返す。前の形なら、ここで分ける。
 * - 分ける前の文書は「-v1-backup」に写す
 * - データベースに印(input_assist_sessions)を入れられた1つの処理だけが、スライス・パスの時間を入れ、メタの文書を書き換える
 *   (同時に開いても二重にならない。スライスは ON CONFLICT DO NOTHING)
 * - 印があるのにメタの文書が前の形のまま(書き換える前に落ちた)なら、メタの文書を書き換え直す。中身(ラリー)はもう使わない
 */
export async function ensureInputAssistMigrated(teamSlug: string, id: string): Promise<InputAssistMeta | null> {
  const document = await readSessionDocument(teamSlug, id);
  if (!document) {
    return null;
  }
  const meta = metaFromDocument(document);
  const marker = await readMarker(teamSlug, id);
  if (marker) {
    // 文書が、データベースの知っている版と同じときだけ書き換え直す(Blob の古い読み込みで、新しいメタを戻さないように)
    if (!isSplitDocument(document) && marker.metaUpdatedAt === document.updatedAt) {
      await writeDocument(sessionKey(teamSlug, id), meta);
    }
    return meta;
  }

  if (isSplitDocument(document)) {
    // メタは新しい形なのに印がない(データベースを作り直したなど)。印だけ入れる
    await query(
      `INSERT INTO input_assist_sessions (session_id, team_slug, meta_updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO NOTHING`,
      [id, teamSlug, meta.updatedAt],
    );
    return meta;
  }

  const legacy = document as InputAssistSession;
  if (!(await readDocument(backupKey(teamSlug, id)))) {
    await writeDocument(backupKey(teamSlug, id), legacy);
  }
  const { slices } = migrateLegacySession(legacy);
  const migratedHere = await transaction(async (run) => {
    const inserted = await run(
      `INSERT INTO input_assist_sessions (session_id, team_slug, meta_updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO NOTHING RETURNING session_id`,
      [id, teamSlug, meta.updatedAt],
    );
    if (inserted.length === 0) {
      return false;
    }
    await insertSlices(run, meta, slices, null);
    for (const log of Array.isArray(legacy.passLogs) ? legacy.passLogs : []) {
      await run(
        `INSERT INTO input_assist_pass_logs
           (id, session_id, team_slug, set_index, pass, started_at, ended_at, seconds, member_id, member_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [
          log.id || createObjectId(),
          id,
          teamSlug,
          log.setIndex,
          log.pass,
          log.startedAt,
          log.endedAt,
          Math.round(log.seconds) || 0,
          log.memberId ?? null,
          log.memberName ?? null,
        ],
      );
    }
    return true;
  });
  if (migratedHere) {
    await writeDocument(sessionKey(teamSlug, id), meta);
    console.log("[input-assist] migrated session to slices", { teamSlug, id, slices: Object.keys(slices).length });
  }
  return meta;
}

function toSliceRecord(row: SliceRow): IaSliceRecord {
  return {
    setIndex: Number(row.set_index),
    pass: row.pass as IaPassName,
    version: Number(row.version),
    data: (row.data ?? emptySliceData(row.pass as IaPassName)) as IaSliceData,
    updatedAt: toIso(row.updated_at),
    updatedByName: row.updated_by_name ?? null,
  };
}

async function readAssignments(id: string): Promise<IaAssignment[]> {
  const rows = await query<{
    set_index: number;
    pass: string;
    holder_id: string | null;
    holder_name: string | null;
    heartbeat_at: unknown;
    done: boolean;
    done_by_name: string | null;
    done_at: unknown;
  }>(
    `SELECT set_index, pass, holder_id, holder_name, heartbeat_at, done, done_by_name, done_at
     FROM input_assist_assignments WHERE session_id = $1`,
    [id],
  );
  return rows.map((row) => ({
    setIndex: Number(row.set_index),
    pass: row.pass as IaPassName,
    holderId: row.holder_id,
    holderName: row.holder_name,
    heartbeatAt: toIso(row.heartbeat_at),
    done: Boolean(row.done),
    doneByName: row.done_by_name,
    doneAt: toIso(row.done_at),
  }));
}

async function readPassSeconds(id: string): Promise<IaPassSeconds[]> {
  const rows = await query<{ set_index: number; pass: string; seconds: number | string }>(
    `SELECT set_index, pass, SUM(seconds) AS seconds FROM input_assist_pass_logs
     WHERE session_id = $1 GROUP BY set_index, pass`,
    [id],
  );
  return rows.map((row) => ({
    setIndex: Number(row.set_index),
    pass: row.pass as IaPassName,
    seconds: Number(row.seconds) || 0,
  }));
}

export async function loadInputAssistBundle(teamSlug: string, id: string): Promise<InputAssistBundle | null> {
  const meta = await ensureInputAssistMigrated(teamSlug, id);
  if (!meta) {
    return null;
  }
  const rows = await query<SliceRow>(
    `SELECT set_index, pass, version, data, updated_at, updated_by_name
     FROM input_assist_slices WHERE session_id = $1 AND team_slug = $2`,
    [id, teamSlug],
  );
  const [assignments, passSeconds] = await Promise.all([readAssignments(id), readPassSeconds(id)]);
  return { meta, slices: rows.map(toSliceRecord), assignments, passSeconds };
}

/** 組み立てたセッション(画面以外で使うとき)。 */
export async function getInputAssistSession(teamSlug: string, id: string): Promise<InputAssistSession | null> {
  const bundle = await loadInputAssistBundle(teamSlug, id);
  if (!bundle) {
    return null;
  }
  return composeSession(
    bundle.meta,
    Object.fromEntries(bundle.slices.map((slice) => [sliceKey(slice.setIndex, slice.pass), slice.data])),
  );
}

// ---- 4 秒ごとに見る ----

/** known は、手元にあるスライスの版("1-P0" → 3)。それより新しいスライスだけ、中身を返す。 */
export async function getInputAssistSyncState(
  teamSlug: string,
  id: string,
  known: Map<string, number>,
  knownMetaUpdatedAt: string | null,
): Promise<InputAssistSyncState | null> {
  if (!isSessionId(id)) {
    return null;
  }
  const marker = await readMarker(teamSlug, id);
  if (!marker) {
    return null;
  }
  const metaUpdatedAt = marker.metaUpdatedAt ?? "";
  const versionRows = await query<SliceRow>(
    `SELECT set_index, pass, version, updated_at, updated_by_name
     FROM input_assist_slices WHERE session_id = $1 AND team_slug = $2`,
    [id, teamSlug],
  );
  const versions: IaSliceVersion[] = versionRows.map((row) => ({
    setIndex: Number(row.set_index),
    pass: row.pass as IaPassName,
    version: Number(row.version),
    updatedAt: toIso(row.updated_at),
    updatedByName: row.updated_by_name ?? null,
  }));
  const newer = versions.filter((entry) => entry.version > (known.get(sliceKey(entry.setIndex, entry.pass)) ?? 0));
  let changed: IaSliceRecord[] = [];
  if (newer.length > 0) {
    const rows = await query<SliceRow>(
      `SELECT set_index, pass, version, data, updated_at, updated_by_name
       FROM input_assist_slices WHERE session_id = $1 AND team_slug = $2
         AND (set_index::text || '-' || pass) = ANY($3::text[])`,
      [id, teamSlug, newer.map((entry) => sliceKey(entry.setIndex, entry.pass))],
    );
    changed = rows.map(toSliceRecord);
  }
  let meta: InputAssistMeta | undefined;
  if (knownMetaUpdatedAt !== null && metaUpdatedAt && metaUpdatedAt !== knownMetaUpdatedAt) {
    const document = await readSessionDocument(teamSlug, id);
    // Blob がまだ前の中身を返すことがある。データベースの版と同じになるまでは返さない(次の回にまた見る)
    meta = document && document.updatedAt === metaUpdatedAt ? metaFromDocument(document) : undefined;
  }
  const [assignments, passSeconds] = await Promise.all([readAssignments(id), readPassSeconds(id)]);
  return { metaUpdatedAt, meta, versions, changed, assignments, passSeconds };
}

// ---- 作る・メタを保存する ----

export type InputAssistSessionInput = {
  title?: unknown;
  date?: unknown;
  opponent?: unknown;
  videoPath?: unknown;
  teams?: unknown;
  extras?: unknown;
  sets?: unknown;
};

function normalizeText(value: unknown, max = TITLE_MAX): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function normalizeTeams(value: unknown, fallback?: Record<IaTeamSide, IaTeam>): Record<IaTeamSide, IaTeam> {
  const input = (value && typeof value === "object" ? value : {}) as Partial<Record<IaTeamSide, unknown>>;
  return {
    home: input.home ? normalizeTeam(input.home, "ホーム") : (fallback?.home ?? normalizeTeam({}, "ホーム")),
    away: input.away ? normalizeTeam(input.away, "アウェイ") : (fallback?.away ?? normalizeTeam({}, "アウェイ")),
  };
}

function normalizeExtras(value: unknown): IaMatchExtras {
  const input = (value && typeof value === "object" ? value : {}) as IaMatchExtras;
  return {
    gameType: typeof input.gameType === "string" ? input.gameType : undefined,
    attackCombinations: Array.isArray(input.attackCombinations) ? input.attackCombinations : undefined,
    setterCalls: Array.isArray(input.setterCalls) ? input.setterCalls : undefined,
  };
}

/** 入力を確かめる。だめならその理由。 */
export function validateSessionInput(input: InputAssistSessionInput, partial: boolean): string | null {
  if ((!partial || input.title !== undefined) && !normalizeText(input.title)) {
    return "試合の名前を入れてください。";
  }
  if ((!partial || input.date !== undefined) && !isIsoDateString(input.date)) {
    return "日付を選んでください。";
  }
  return null;
}

/** 新しい試合。VSM から読み込んだラリー・タッチがあれば、スライスに分けて入れる。 */
export async function createInputAssistSession(
  teamSlug: string,
  input: InputAssistSessionInput,
  member: Member,
): Promise<InputAssistMeta> {
  const now = new Date().toISOString();
  const sets: IaSet[] = normalizeSets(input.sets);
  const session: InputAssistSession = {
    id: createObjectId(),
    teamSlug,
    title: normalizeText(input.title),
    date: isIsoDateString(input.date) ? input.date : now.slice(0, 10),
    opponent: normalizeText(input.opponent),
    videoPath: normalizeText(input.videoPath, 260) || undefined,
    teams: normalizeTeams(input.teams),
    extras: normalizeExtras(input.extras),
    sets,
    passLogs: [],
    createdAt: now,
    updatedAt: now,
    createdBy: member.id,
  };
  const { meta, slices } = migrateLegacySession(session);
  await transaction(async (run) => {
    await run("INSERT INTO input_assist_sessions (session_id, team_slug, meta_updated_at) VALUES ($1, $2, $3)", [
      meta.id,
      teamSlug,
      meta.updatedAt,
    ]);
    await insertSlices(run, meta, slices, member.displayName);
  });
  await writeDocument(sessionKey(teamSlug, meta.id), meta);
  await writeIndexEntry(meta, summarizeSession(session).rallyCount);
  return meta;
}

/**
 * メタ(名前・日付・チーム・セットの準備)を保存する。セットのラリー・交代・タイムアウトは受け取っても使わない(スライスで保存する)。
 * expectedUpdatedAt が今のメタと違えば、ほかの画面が先に保存したので InputAssistConflictError。
 */
export async function updateInputAssistMeta(
  teamSlug: string,
  id: string,
  input: InputAssistSessionInput,
  expectedUpdatedAt?: string,
): Promise<InputAssistMeta | null> {
  const current = await ensureInputAssistMigrated(teamSlug, id);
  if (!current) {
    return null;
  }
  const next = metaOf({
    ...current,
    title: input.title !== undefined ? normalizeText(input.title) : current.title,
    date: isIsoDateString(input.date) ? input.date : current.date,
    opponent: input.opponent !== undefined ? normalizeText(input.opponent) : current.opponent,
    videoPath: input.videoPath !== undefined ? normalizeText(input.videoPath, 260) || undefined : current.videoPath,
    teams: input.teams !== undefined ? normalizeTeams(input.teams, current.teams) : current.teams,
    extras: input.extras !== undefined ? normalizeExtras(input.extras) : current.extras,
    sets: input.sets !== undefined ? normalizeSets(input.sets) : current.sets,
    updatedAt: new Date().toISOString(),
  });
  // メタの版はデータベースで見る(Blob は、書いたすぐあとに前の中身を返すことがあるため)。
  // 版が合ったときだけ進めるので、同時に2人が保存しても、片方は 409 になる。
  const moved = await query(
    `UPDATE input_assist_sessions SET meta_updated_at = $3
     WHERE session_id = $1 AND team_slug = $2 AND ($4::text IS NULL OR meta_updated_at = $4 OR meta_updated_at IS NULL)
     RETURNING session_id`,
    [id, teamSlug, next.updatedAt, expectedUpdatedAt ?? null],
  );
  if (moved.length === 0) {
    throw new InputAssistConflictError(current);
  }
  await writeDocument(sessionKey(teamSlug, id), next);
  await writeIndexEntry(next);
  return next;
}

/**
 * 「試合ビューアに保存」で作ったものを、メタに覚える。サーバーの今のメタに足すだけなので、版は確かめない
 * (画面は 4 秒ごとに見たときに、新しいメタを受け取る)。
 */
export async function setInputAssistMatchViewer(
  teamSlug: string,
  id: string,
  link: IaMatchViewerLink,
): Promise<InputAssistMeta | null> {
  const current = await ensureInputAssistMigrated(teamSlug, id);
  if (!current) {
    return null;
  }
  const next = metaOf({ ...current, matchViewer: link, updatedAt: new Date().toISOString() });
  await query("UPDATE input_assist_sessions SET meta_updated_at = $3 WHERE session_id = $1 AND team_slug = $2", [
    id,
    teamSlug,
    next.updatedAt,
  ]);
  await writeDocument(sessionKey(teamSlug, id), next);
  await writeIndexEntry(next);
  return next;
}

// ---- スライスを保存する ----

export type SliceSaveResult = { ok: true; record: IaSliceRecord } | { ok: false; current: IaSliceRecord };

/**
 * スライスを1つ保存する。expectedVersion が今の版と違えば保存せず、今のスライスを返す(画面で合わせて保存し直す)。
 * 別のスライス(別のセット・別のパス)は別の行なので、決してぶつからない。
 */
export async function saveInputAssistSlice(
  teamSlug: string,
  id: string,
  setIndex: number,
  pass: IaPassName,
  data: IaSliceData,
  expectedVersion: number,
  member: Member,
): Promise<SliceSaveResult | null> {
  if (!(await isMigrated(teamSlug, id))) {
    return null;
  }
  const json = JSON.stringify(data);
  const rallyCount = pass === "P0" ? countRalliesInSlice(data) : 0;
  let rows: SliceRow[];
  if (expectedVersion === 0) {
    rows = await query<SliceRow>(
      `INSERT INTO input_assist_slices
         (session_id, team_slug, set_index, pass, version, data, rally_count, updated_by, updated_by_name)
       VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6, $7, $8)
       ON CONFLICT (session_id, set_index, pass) DO NOTHING
       RETURNING set_index, pass, version, data, updated_at, updated_by_name`,
      [id, teamSlug, setIndex, pass, json, rallyCount, member.id, member.displayName],
    );
  } else {
    rows = await query<SliceRow>(
      `UPDATE input_assist_slices
       SET data = $5::jsonb, version = version + 1, rally_count = $6, updated_by = $7, updated_by_name = $8,
         updated_at = now()
       WHERE session_id = $1 AND team_slug = $2 AND set_index = $3 AND pass = $4 AND version = $9
       RETURNING set_index, pass, version, data, updated_at, updated_by_name`,
      [id, teamSlug, setIndex, pass, json, rallyCount, member.id, member.displayName, expectedVersion],
    );
  }
  if (rows.length > 0) {
    return { ok: true, record: toSliceRecord(rows[0]) };
  }
  const current = await query<SliceRow>(
    `SELECT set_index, pass, version, data, updated_at, updated_by_name FROM input_assist_slices
     WHERE session_id = $1 AND team_slug = $2 AND set_index = $3 AND pass = $4`,
    [id, teamSlug, setIndex, pass],
  );
  return {
    ok: false,
    current: current[0]
      ? toSliceRecord(current[0])
      : { setIndex, pass, version: 0, data: emptySliceData(pass), updatedAt: null, updatedByName: null },
  };
}

// ---- 担当 ----

export type AssignmentAction = "claim" | "heartbeat" | "release" | "done" | "reopen";
export const ASSIGNMENT_ACTIONS: AssignmentAction[] = ["claim", "heartbeat", "release", "done", "reopen"];

export type AssignmentResult = {
  /** 思ったとおりにできたか(claim・heartbeat で、ほかの人が担当していれば false)。 */
  ok: boolean;
  assignments: IaAssignment[];
};

/**
 * 担当を変える。
 * - claim:だれも担当していない・自分・止まっている(2 分なにも送ってこない)なら自分にする。force なら、ほかの人からも引き継ぐ
 * - heartbeat:自分が担当していれば「まだいる」の時刻を新しくする(ほかの人に引き継がれていれば ok = false)
 * - release:自分の担当を外す。done:完了にする(担当は外す)。reopen:完了を取り消す
 */
export async function updateInputAssistAssignment(
  teamSlug: string,
  id: string,
  action: AssignmentAction,
  setIndex: number,
  pass: IaPassName,
  member: Member,
  force = false,
): Promise<AssignmentResult | null> {
  if (!(await isMigrated(teamSlug, id))) {
    return null;
  }
  const staleBefore = new Date(Date.now() - PRESENCE_STALE_MS).toISOString();
  let ok = true;
  if (action === "claim") {
    const rows = await query(
      `INSERT INTO input_assist_assignments (session_id, team_slug, set_index, pass, holder_id, holder_name, heartbeat_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (session_id, set_index, pass) DO UPDATE SET
         holder_id = EXCLUDED.holder_id, holder_name = EXCLUDED.holder_name, heartbeat_at = now(), updated_at = now()
       WHERE input_assist_assignments.holder_id IS NULL
         OR input_assist_assignments.holder_id = EXCLUDED.holder_id
         OR input_assist_assignments.heartbeat_at IS NULL
         OR input_assist_assignments.heartbeat_at < $7::timestamptz
         OR $8::boolean
       RETURNING set_index`,
      [id, teamSlug, setIndex, pass, member.id, member.displayName, staleBefore, force],
    );
    ok = rows.length > 0;
  } else if (action === "heartbeat") {
    const rows = await query(
      `UPDATE input_assist_assignments SET heartbeat_at = now(), updated_at = now()
       WHERE session_id = $1 AND set_index = $2 AND pass = $3 AND holder_id = $4 RETURNING set_index`,
      [id, setIndex, pass, member.id],
    );
    ok = rows.length > 0;
  } else if (action === "release") {
    await query(
      `UPDATE input_assist_assignments SET holder_id = NULL, holder_name = NULL, heartbeat_at = NULL, updated_at = now()
       WHERE session_id = $1 AND set_index = $2 AND pass = $3 AND holder_id = $4`,
      [id, setIndex, pass, member.id],
    );
  } else if (action === "done") {
    await query(
      `INSERT INTO input_assist_assignments (session_id, team_slug, set_index, pass, done, done_by_name, done_at)
       VALUES ($1, $2, $3, $4, true, $5, now())
       ON CONFLICT (session_id, set_index, pass) DO UPDATE SET
         done = true, done_by_name = EXCLUDED.done_by_name, done_at = now(),
         holder_id = NULL, holder_name = NULL, heartbeat_at = NULL, updated_at = now()`,
      [id, teamSlug, setIndex, pass, member.displayName],
    );
  } else {
    await query(
      `UPDATE input_assist_assignments SET done = false, done_by_name = NULL, done_at = NULL, updated_at = now()
       WHERE session_id = $1 AND set_index = $2 AND pass = $3`,
      [id, setIndex, pass],
    );
  }
  return { ok, assignments: await readAssignments(id) };
}

// ---- パスの時間 ----

export type PassLogInput = {
  setIndex?: unknown;
  pass?: unknown;
  seconds?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
};

/** パスにかかった時間を足す(だれが打ったかも残す。スライスとは別なので、ほかの人の保存とぶつからない)。 */
export async function appendInputAssistPassLog(
  teamSlug: string,
  id: string,
  input: PassLogInput,
  member: Member,
): Promise<IaPassLog | null> {
  const seconds = Math.round(Number(input.seconds));
  const setIndex = Math.trunc(Number(input.setIndex));
  if (!(seconds > 0 && seconds < 24 * 60 * 60) || !(setIndex >= 1 && setIndex <= 5)) {
    return null;
  }
  if (!(await isMigrated(teamSlug, id)) && !(await ensureInputAssistMigrated(teamSlug, id))) {
    return null;
  }
  const now = new Date().toISOString();
  const log: IaPassLog = {
    id: createObjectId(),
    setIndex,
    pass: IA_PASSES.includes(input.pass as IaPassName) ? (input.pass as IaPassName) : "P0",
    startedAt: typeof input.startedAt === "string" ? input.startedAt.slice(0, 40) : now,
    endedAt: typeof input.endedAt === "string" ? input.endedAt.slice(0, 40) : now,
    seconds,
    memberId: member.id,
    memberName: member.displayName,
  };
  await query(
    `INSERT INTO input_assist_pass_logs
       (id, session_id, team_slug, set_index, pass, started_at, ended_at, seconds, member_id, member_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [log.id, id, teamSlug, log.setIndex, log.pass, log.startedAt, log.endedAt, log.seconds, log.memberId, log.memberName],
  );
  return log;
}
