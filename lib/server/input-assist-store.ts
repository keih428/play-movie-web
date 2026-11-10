import { createObjectId } from "@/lib/domain/input-assist/ids";
import {
  isIsoDateString,
  normalizeSets,
  normalizeTeam,
  summarizeSession,
} from "@/lib/domain/input-assist/session";
import type {
  IaMatchExtras,
  IaPassLog,
  IaSet,
  IaTeam,
  IaTeamSide,
  InputAssistSession,
  InputAssistSessionSummary,
} from "@/lib/domain/input-assist/types";
import { readDocument, writeDocument } from "@/lib/server/document-store";

// 打ち込み補助のセッションを、ドキュメント(手元は .data/documents、本番は Vercel Blob)に1試合1つで置く。
// 一覧は別のドキュメント(index)に持つ。

const TITLE_MAX = 80;

function indexKey(teamSlug: string) {
  return `input-assist-${teamSlug}-index`;
}

function sessionKey(teamSlug: string, id: string) {
  return `input-assist-${teamSlug}-${id}`;
}

function isSessionId(value: string) {
  return /^[0-9a-f]{24}$/.test(value);
}

export class InputAssistConflictError extends Error {
  constructor(readonly current: InputAssistSession) {
    super("ほかの画面で先に保存されました。");
  }
}

export async function listInputAssistSessions(teamSlug: string): Promise<InputAssistSessionSummary[]> {
  const index = (await readDocument<InputAssistSessionSummary[]>(indexKey(teamSlug))) ?? [];
  return [...index].sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt));
}

export async function getInputAssistSession(teamSlug: string, id: string): Promise<InputAssistSession | null> {
  if (!isSessionId(id)) {
    return null;
  }
  const session = await readDocument<InputAssistSession>(sessionKey(teamSlug, id));
  return session && session.teamSlug === teamSlug ? session : null;
}

async function writeSession(session: InputAssistSession): Promise<InputAssistSession> {
  await writeDocument(sessionKey(session.teamSlug, session.id), session);
  const index = (await readDocument<InputAssistSessionSummary[]>(indexKey(session.teamSlug))) ?? [];
  const summary = summarizeSession(session);
  const next = index.some((entry) => entry.id === session.id)
    ? index.map((entry) => (entry.id === session.id ? summary : entry))
    : [...index, summary];
  await writeDocument(indexKey(session.teamSlug), next);
  return session;
}

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

export async function createInputAssistSession(
  teamSlug: string,
  input: InputAssistSessionInput,
  createdBy?: string,
): Promise<InputAssistSession> {
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
    createdBy,
  };
  return writeSession(session);
}

export async function updateInputAssistSession(
  teamSlug: string,
  id: string,
  input: InputAssistSessionInput,
  expectedUpdatedAt?: string,
): Promise<InputAssistSession | null> {
  const current = await getInputAssistSession(teamSlug, id);
  if (!current) {
    return null;
  }
  if (expectedUpdatedAt && expectedUpdatedAt !== current.updatedAt) {
    throw new InputAssistConflictError(current);
  }
  const next: InputAssistSession = {
    ...current,
    title: input.title !== undefined ? normalizeText(input.title) : current.title,
    date: isIsoDateString(input.date) ? input.date : current.date,
    opponent: input.opponent !== undefined ? normalizeText(input.opponent) : current.opponent,
    videoPath: input.videoPath !== undefined ? normalizeText(input.videoPath, 260) || undefined : current.videoPath,
    teams: input.teams !== undefined ? normalizeTeams(input.teams, current.teams) : current.teams,
    extras: input.extras !== undefined ? normalizeExtras(input.extras) : current.extras,
    sets: input.sets !== undefined ? normalizeSets(input.sets) : current.sets,
    updatedAt: new Date().toISOString(),
  };
  return writeSession(next);
}

export type PassLogInput = {
  setIndex?: unknown;
  pass?: unknown;
  seconds?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
};

/** パスにかかった時間を足す(セッションの中身とは別に足すので、ほかの人の保存とぶつからない)。 */
export async function appendInputAssistPassLog(
  teamSlug: string,
  id: string,
  input: PassLogInput,
  member: { id: string; displayName: string },
): Promise<IaPassLog | null> {
  const current = await getInputAssistSession(teamSlug, id);
  if (!current) {
    return null;
  }
  const seconds = Math.round(Number(input.seconds));
  const setIndex = Math.trunc(Number(input.setIndex));
  if (!(seconds > 0 && seconds < 24 * 60 * 60) || !(setIndex >= 1 && setIndex <= 5)) {
    return null;
  }
  const now = new Date().toISOString();
  const log: IaPassLog = {
    id: createObjectId(),
    setIndex,
    pass: input.pass === "P1" || input.pass === "P2" ? input.pass : "P0",
    startedAt: typeof input.startedAt === "string" ? input.startedAt : now,
    endedAt: typeof input.endedAt === "string" ? input.endedAt : now,
    seconds,
    memberId: member.id,
    memberName: member.displayName,
  };
  // updatedAt は変えない(作業中のほかの画面の保存を止めないため)。
  await writeDocument(sessionKey(teamSlug, id), { ...current, passLogs: [...current.passLogs, log] });
  return log;
}
