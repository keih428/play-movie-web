// セッション(1試合)を作る・整える・まとめる。

import type { Member } from "@/lib/domain/portal";
import { computeSet, sortRallies } from "@/lib/domain/input-assist/engine";
import { createObjectId } from "@/lib/domain/input-assist/ids";
import {
  IA_POSITIONS,
  type IaLineup,
  type IaRally,
  type IaSet,
  type IaTeam,
  type IaTeamSide,
  type InputAssistSession,
  type InputAssistSessionSummary,
} from "@/lib/domain/input-assist/types";

/** 打ち込み補助を使えるのは、スタッフ(ポジションのない人・役割がスタッフの人)とシステム担当。 */
export function canUseInputAssist(member: Pick<Member, "position" | "role" | "isSystemAdmin">): boolean {
  return member.isSystemAdmin || member.role === "staff" || !member.position;
}

export function emptyLineup(): IaLineup {
  return {
    positions: { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null },
    setterAt: 1,
  };
}

export function emptyTeam(name: string): IaTeam {
  return { name, players: [], libero: [], staff: emptyStaff() };
}

/** VSM のチームの staff(田中の書き方では、5つとも空)。 */
export function emptyStaff() {
  return { coach: {}, assistantCoach: {}, assistantCoach2: {}, therapist: {}, medicalDoctor: {} };
}

export function createEmptySet(setIndex: number, previous?: IaSet): IaSet {
  return {
    setIndex,
    youtubeUrl: previous?.youtubeUrl ?? "",
    nearTeam: previous?.nearTeam ?? "home",
    startingLineup: previous
      ? {
          home: { positions: { ...previous.startingLineup.home.positions }, setterAt: previous.startingLineup.home.setterAt },
          away: { positions: { ...previous.startingLineup.away.positions }, setterAt: previous.startingLineup.away.setterAt },
        }
      : { home: emptyLineup(), away: emptyLineup() },
    finalScore: { home: null, away: null },
    rallies: [],
    substitutions: [],
    timeouts: [],
  };
}

export function createRally(serveTime: number, init: Partial<IaRally> = {}): IaRally {
  return {
    id: createObjectId(),
    serveTime: roundTime(serveTime),
    side: null,
    status: "rally",
    source: "manual",
    ...init,
  };
}

/** 動画の時刻は 0.1 秒(VSM の単位)にそろえる。 */
export function roundTime(seconds: number): number {
  return Math.max(0, Math.round(seconds * 10) / 10);
}

export function summarizeSession(session: InputAssistSession): InputAssistSessionSummary {
  return {
    id: session.id,
    teamSlug: session.teamSlug,
    title: session.title,
    date: session.date,
    opponent: session.opponent,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    setCount: session.sets.length,
    rallyCount: session.sets.reduce(
      (total, set) => total + set.rallies.filter((rally) => rally.status === "rally").length,
      0,
    ),
  };
}

export type IaSetCheck = {
  setIndex: number;
  countedRallies: number;
  requiredRallies: number | null;
  score: { home: number; away: number };
  finalScore: IaSet["finalScore"];
  countMatches: boolean | null;
  scoreMatches: boolean | null;
  undecidedRallies: number;
};

export function checkSets(session: Pick<InputAssistSession, "sets">): IaSetCheck[] {
  return session.sets.map((set) => {
    const result = computeSet(set);
    return {
      setIndex: set.setIndex,
      countedRallies: result.countedRallies,
      requiredRallies: result.requiredRallies,
      score: result.score,
      finalScore: set.finalScore,
      countMatches: result.countMatches,
      scoreMatches: result.scoreMatches,
      undecidedRallies: result.undecidedRallies,
    };
  });
}

/** ラリーだけを流すときの区間:サーブの 2 秒前から、次のラリーのサーブの 3 秒前まで。 */
export const RALLY_LEAD_SECONDS = 2;
export const RALLY_TAIL_SECONDS = 3;
/** 次のラリーがないときに流す長さ。 */
export const LAST_RALLY_SECONDS = 20;

export function getRallyWindow(rallies: IaRally[], rallyId: string): { start: number; end: number } | null {
  const sorted = sortRallies(rallies);
  const index = sorted.findIndex((rally) => rally.id === rallyId);
  if (index === -1) {
    return null;
  }
  const rally = sorted[index];
  const start = Math.max(0, rally.serveTime - RALLY_LEAD_SECONDS);
  const next = sorted[index + 1];
  const end = next ? next.serveTime - RALLY_TAIL_SECONDS : rally.serveTime + LAST_RALLY_SECONDS;
  return { start, end: Math.max(end, rally.serveTime + 1) };
}

/** AI の確かさがこれより低いラリーは目立たせる。 */
export const LOW_CONFIDENCE = 0.8;

export function isLowConfidence(rally: IaRally): boolean {
  return typeof rally.confidence === "number" && rally.confidence < LOW_CONFIDENCE && !rally.checked;
}

// ---- 保存する前に形を整える(API で受け取ったものを信じすぎない) ----

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLineup(value: unknown): IaLineup {
  const input = (value && typeof value === "object" ? value : {}) as Partial<IaLineup>;
  const positions = emptyLineup().positions;
  for (const position of IA_POSITIONS) {
    const number = toNumberOrNull(input.positions?.[position]);
    positions[position] = number === null ? null : Math.trunc(number);
  }
  const setterAt = Math.trunc(Number(input.setterAt));
  return { positions, setterAt: setterAt >= 1 && setterAt <= 6 ? setterAt : 1 };
}

function normalizeRally(value: unknown): IaRally | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Partial<IaRally>;
  const serveTime = Number(input.serveTime);
  if (typeof input.id !== "string" || !input.id || !Number.isFinite(serveTime)) {
    return null;
  }
  return {
    id: input.id,
    serveTime: roundTime(serveTime),
    side: input.side === "near" || input.side === "far" ? input.side : null,
    confidence: typeof input.confidence === "number" && Number.isFinite(input.confidence) ? input.confidence : undefined,
    status: input.status === "not_rally" ? "not_rally" : "rally",
    source: input.source === "auto" ? "auto" : "manual",
    checked: input.checked === true ? true : undefined,
    plays: Array.isArray(input.plays) ? input.plays : undefined,
  };
}

function normalizeTeamSide(value: unknown): IaTeamSide {
  return value === "away" ? "away" : "home";
}

export function normalizeSet(value: unknown, fallbackIndex: number): IaSet {
  const input = (value && typeof value === "object" ? value : {}) as Partial<IaSet>;
  const setIndex = Math.trunc(Number(input.setIndex));
  return {
    setIndex: setIndex >= 1 && setIndex <= 5 ? setIndex : fallbackIndex,
    youtubeUrl: typeof input.youtubeUrl === "string" ? input.youtubeUrl.trim() : "",
    nearTeam: normalizeTeamSide(input.nearTeam),
    startingLineup: {
      home: normalizeLineup(input.startingLineup?.home),
      away: normalizeLineup(input.startingLineup?.away),
    },
    finalScore: {
      home: toNumberOrNull(input.finalScore?.home),
      away: toNumberOrNull(input.finalScore?.away),
    },
    rallies: Array.isArray(input.rallies)
      ? input.rallies.map(normalizeRally).filter((rally): rally is IaRally => rally !== null)
      : [],
    substitutions: Array.isArray(input.substitutions)
      ? input.substitutions
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            id: typeof entry.id === "string" && entry.id ? entry.id : createObjectId(),
            time: roundTime(Number(entry.time) || 0),
            team: normalizeTeamSide(entry.team),
            playerIn: Math.trunc(Number(entry.playerIn)) || 0,
            playerOut: Math.trunc(Number(entry.playerOut)) || 0,
          }))
          .filter((entry) => entry.playerIn > 0 && entry.playerOut > 0)
      : [],
    timeouts: Array.isArray(input.timeouts)
      ? input.timeouts
          .filter((entry) => entry && typeof entry === "object" && Number.isFinite(Number(entry.time)))
          .map((entry) => ({
            id: typeof entry.id === "string" && entry.id ? entry.id : createObjectId(),
            time: roundTime(Number(entry.time)),
            team: normalizeTeamSide(entry.team),
          }))
      : [],
  };
}

export function normalizeTeam(value: unknown, fallbackName: string): IaTeam {
  const input = (value && typeof value === "object" ? value : {}) as Partial<IaTeam>;
  const players = Array.isArray(input.players)
    ? input.players
        .filter((player) => player && typeof player === "object" && Number.isFinite(Number(player.shirtNumber)))
        .map((player) => ({ ...player, shirtNumber: Math.trunc(Number(player.shirtNumber)) }))
    : [];
  // 読み込んだチームの欄(code・shortCode・staff・選手の _id など)は、並びも含めてそのまま残す。
  return {
    ...input,
    name: typeof input.name === "string" && input.name.trim() ? input.name : fallbackName,
    players,
    libero: Array.isArray(input.libero)
      ? input.libero.map((number) => Math.trunc(Number(number))).filter((number) => Number.isFinite(number))
      : [],
    staff: input.staff ?? emptyStaff(),
  };
}

export function normalizeSets(value: unknown): IaSet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const sets = value.map((entry, index) => normalizeSet(entry, index + 1));
  const seen = new Set<number>();
  return sets
    .filter((set) => (seen.has(set.setIndex) ? false : (seen.add(set.setIndex), true)))
    .sort((left, right) => left.setIndex - right.setIndex);
}

export function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
