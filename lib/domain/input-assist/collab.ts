// 共同編集(2026-11-10 から):1つの試合を、セット × パス(P0〜P4)ごとの切れ端(スライス)に分けて持つ。
// 何人かが同じ試合を同時に打つ(A が 1セット目の P0 → 2セット目の P0、そのあいだに B が 1セット目の P1 …)ため、
// それぞれのパスは自分の持ち分の欄だけを、自分のスライスに保存する。別のスライスどうしは決してぶつからない。
//
// - メタ(試合の名前・日付・チーム・セットの準備:URL・手前のチーム・最終スコア・スタメン・打たないセット)は1つの文書
// - P0:ラリーのあるなし・並び・向き・時刻・確かさ・出どころ・確認、交代、タイムアウト
// - P1:ラリーごとのタッチ(id・チーム・背番号・スキル・時刻・出どころ)と、入れ終えたか(flowDone)
// - P2:タッチごとの評価(effect・effectSource)
// - P3:タッチごとのゾーン(startZone など)とその出どころ
// - P4:タッチごとの種類(hitType など)と typeSource
//
// 画面では、メタとスライスを合わせて今までどおりの InputAssistSession にして使う(composeSession)。
// 保存するときは、また分けて(splitSession)、前に読んだ中身と違うスライスだけを送る。
// ラリーとタッチは id で結ぶので、P0 で消したラリー・P1 で消したタッチの、あとのパスの中身は合わせるときに捨てる
// (そのスライスを次に保存したときに消える)。

import { normalizeSet, normalizeSets } from "@/lib/domain/input-assist/session";
import type {
  IaPassName,
  IaPlay,
  IaRally,
  IaSet,
  IaSubstitution,
  IaTimeout,
  InputAssistSession,
} from "@/lib/domain/input-assist/types";

export const IA_PASSES: IaPassName[] = ["P0", "P1", "P2", "P3", "P4"];

/** メタの文書の形の番号。2 = スライスに分けたもの。ないもの(1)は、セッションをまるごと1つの文書に持っていたもの。 */
export const IA_STORAGE_VERSION = 2;

/** セットの準備(メタに持つ欄)。 */
export type IaSetSetup = Omit<IaSet, "rallies" | "substitutions" | "timeouts">;

/**
 * メタの文書。sets にはラリー・交代・タイムアウトを持たない(空の配列。前の形を読む画面が落ちないように欄は残す)。
 * パスの時間(passLogs)はデータベースに持つので、ここでは空。
 */
export type InputAssistMeta = Omit<InputAssistSession, "sets" | "passLogs"> & {
  storageVersion: typeof IA_STORAGE_VERSION;
  sets: IaSet[];
};

export type IaP0Rally = Omit<IaRally, "plays" | "flowDone">;
export type IaP0Data = { rallies: IaP0Rally[]; substitutions: IaSubstitution[]; timeouts: IaTimeout[] };
export type IaP1Entry = { flowDone?: true; plays?: IaPlay[] };
export type IaP1Data = { rallies: Record<string, IaP1Entry> };
export type IaPlayFieldsData = { plays: Record<string, Partial<IaPlay>> };
export type IaSliceData = IaP0Data | IaP1Data | IaPlayFieldsData;

export type IaSliceDataMap = Record<string, IaSliceData>;

/** P2〜P4 が持つタッチの欄。残り(id・チーム・背番号・スキル・時刻・出どころ・code・extra など)は P1。 */
export const PASS_PLAY_FIELDS: Record<"P2" | "P3" | "P4", Array<keyof IaPlay>> = {
  P2: ["effect", "effectSource"],
  P3: ["startZone", "startSubZone", "endZone", "endSubZone", "startZoneSource", "endZoneSource"],
  P4: ["hitType", "combination", "targetAttacker", "players", "skillType", "typeSource"],
};
const LATER_PLAY_FIELDS = new Set<string>([...PASS_PLAY_FIELDS.P2, ...PASS_PLAY_FIELDS.P3, ...PASS_PLAY_FIELDS.P4]);

export function sliceKey(setIndex: number, pass: IaPassName): string {
  return `${setIndex}-${pass}`;
}

export function parseSliceKey(key: string): { setIndex: number; pass: IaPassName } | null {
  const match = /^([1-5])-(P[0-4])$/.exec(key);
  return match ? { setIndex: Number(match[1]), pass: match[2] as IaPassName } : null;
}

export function isPassName(value: unknown): value is IaPassName {
  return typeof value === "string" && (IA_PASSES as string[]).includes(value);
}

export function emptySliceData(pass: IaPassName): IaSliceData {
  if (pass === "P0") {
    return { rallies: [], substitutions: [], timeouts: [] };
  }
  if (pass === "P1") {
    return { rallies: {} };
  }
  return { plays: {} };
}

/** キーの並びによらない JSON(中身が同じかを見るため)。undefined の欄は書かない。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => (entry === undefined ? "null" : stableStringify(entry))).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function sameData(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function pick<T extends object>(source: T, fields: Array<keyof T>): Partial<T> {
  const output: Partial<T> = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      output[field] = source[field];
    }
  }
  return output;
}

function stripLaterFields(play: IaPlay): IaPlay {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(play)) {
    if (!LATER_PLAY_FIELDS.has(key) && value !== undefined) {
      output[key] = value;
    }
  }
  return output as IaPlay;
}

function compareRallies(left: Pick<IaRally, "serveTime" | "id">, right: Pick<IaRally, "serveTime" | "id">) {
  return left.serveTime - right.serveTime || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function toSetSetup(set: IaSet): IaSet {
  return { ...set, rallies: [], substitutions: [], timeouts: [] };
}

/** セッションからメタ(準備だけ)を作る。 */
export function metaOf(session: InputAssistSession | InputAssistMeta): InputAssistMeta {
  const meta: Record<string, unknown> = { ...session };
  delete meta.passLogs;
  return {
    ...(meta as Omit<InputAssistMeta, "sets" | "storageVersion">),
    storageVersion: IA_STORAGE_VERSION,
    sets: session.sets.map(toSetSetup),
  };
}

/** 1セットの、パスごとの中身。 */
export function splitSet(set: IaSet): Record<IaPassName, IaSliceData> {
  const rallies = [...set.rallies].sort(compareRallies);
  const p0: IaP0Data = {
    rallies: rallies.map((rally) => {
      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rally)) {
        if (key !== "plays" && key !== "flowDone" && value !== undefined) {
          output[key] = value;
        }
      }
      return output as IaP0Rally;
    }),
    substitutions: set.substitutions,
    timeouts: set.timeouts,
  };
  const p1: IaP1Data = { rallies: {} };
  const later: Record<"P2" | "P3" | "P4", IaPlayFieldsData> = { P2: { plays: {} }, P3: { plays: {} }, P4: { plays: {} } };
  for (const rally of rallies) {
    if (rally.plays === undefined && !rally.flowDone) {
      continue;
    }
    const entry: IaP1Entry = {};
    if (rally.flowDone) {
      entry.flowDone = true;
    }
    if (rally.plays !== undefined) {
      entry.plays = rally.plays.map(stripLaterFields);
      for (const play of rally.plays) {
        for (const pass of ["P2", "P3", "P4"] as const) {
          const fields = pick(play, PASS_PLAY_FIELDS[pass]);
          if (Object.keys(fields).length > 0) {
            later[pass].plays[play.id] = fields;
          }
        }
      }
    }
    p1.rallies[rally.id] = entry;
  }
  return { P0: p0, P1: p1, P2: later.P2, P3: later.P3, P4: later.P4 };
}

/** セッションを、メタとスライス(キーは "1-P0" など)に分ける。打たないセットも分ける(あとで打つことがある)。 */
export function splitSession(session: InputAssistSession): { meta: InputAssistMeta; slices: IaSliceDataMap } {
  const slices: IaSliceDataMap = {};
  for (const set of session.sets) {
    const bySet = splitSet(set);
    for (const pass of IA_PASSES) {
      slices[sliceKey(set.setIndex, pass)] = bySet[pass];
    }
  }
  return { meta: metaOf(session), slices };
}

function asP0(data: IaSliceData | undefined): IaP0Data {
  const input = (data ?? {}) as Partial<IaP0Data>;
  return {
    rallies: Array.isArray(input.rallies) ? input.rallies : [],
    substitutions: Array.isArray(input.substitutions) ? input.substitutions : [],
    timeouts: Array.isArray(input.timeouts) ? input.timeouts : [],
  };
}

function asP1(data: IaSliceData | undefined): IaP1Data {
  const input = (data ?? {}) as Partial<IaP1Data>;
  return { rallies: input.rallies && typeof input.rallies === "object" && !Array.isArray(input.rallies) ? input.rallies : {} };
}

function asPlayFields(data: IaSliceData | undefined): IaPlayFieldsData {
  const input = (data ?? {}) as Partial<IaPlayFieldsData>;
  return { plays: input.plays && typeof input.plays === "object" && !Array.isArray(input.plays) ? input.plays : {} };
}

/** メタとスライスから、セッションを組み立てる。もう無いラリー・タッチを指すあとのパスの中身は捨てる。 */
export function composeSession(
  meta: InputAssistMeta | InputAssistSession,
  slices: IaSliceDataMap,
): InputAssistSession {
  const sets = meta.sets.map((setup) => {
    const p0 = asP0(slices[sliceKey(setup.setIndex, "P0")]);
    const p1 = asP1(slices[sliceKey(setup.setIndex, "P1")]);
    const later = {
      P2: asPlayFields(slices[sliceKey(setup.setIndex, "P2")]).plays,
      P3: asPlayFields(slices[sliceKey(setup.setIndex, "P3")]).plays,
      P4: asPlayFields(slices[sliceKey(setup.setIndex, "P4")]).plays,
    };
    const rallies: IaRally[] = p0.rallies.map((p0Rally) => {
      const rally: IaRally = { ...p0Rally };
      const entry = p1.rallies[p0Rally.id];
      if (entry?.flowDone) {
        rally.flowDone = true;
      }
      if (entry?.plays) {
        rally.plays = entry.plays.map((play) => {
          const composed: IaPlay = { ...stripLaterFields(play) };
          for (const pass of ["P2", "P3", "P4"] as const) {
            const fields = later[pass][play.id];
            if (fields) {
              Object.assign(composed, pick(fields, PASS_PLAY_FIELDS[pass]));
            }
          }
          return composed;
        });
      }
      return rally;
    });
    return {
      ...setup,
      rallies,
      substitutions: p0.substitutions,
      timeouts: p0.timeouts,
    } satisfies IaSet;
  });
  const rest: Record<string, unknown> = { ...meta };
  delete rest.storageVersion;
  return { ...(rest as Omit<InputAssistSession, "sets" | "passLogs">), sets, passLogs: [] };
}

/** スライスの中身を、そのキーのものに差し替える(remote の中身を入れるときなど)。 */
export function replaceSlice(session: InputAssistSession, key: string, data: IaSliceData): InputAssistSession {
  const { meta, slices } = splitSession(session);
  return composeSession(meta, { ...slices, [key]: data });
}

// ---- API で受け取ったスライスを整える ----

/** 受け取ったスライスの中身を確かめて整える。読めなければ null。 */
export function normalizeSliceData(pass: IaPassName, value: unknown): IaSliceData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const input = value as Record<string, unknown>;
  if (pass === "P0") {
    // normalizeSet でラリー・交代・タイムアウトを整える(plays・flowDone は落とす)
    const set = normalizeSet(
      { setIndex: 1, rallies: input.rallies, substitutions: input.substitutions, timeouts: input.timeouts },
      1,
    );
    return splitSet({ ...set, rallies: set.rallies.map((rally) => ({ ...rally, plays: undefined, flowDone: undefined })) }).P0;
  }
  if (pass === "P1") {
    const rallies = input.rallies && typeof input.rallies === "object" && !Array.isArray(input.rallies)
      ? (input.rallies as Record<string, unknown>)
      : {};
    const output: IaP1Data = { rallies: {} };
    for (const [rallyId, raw] of Object.entries(rallies)) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const entry = raw as IaP1Entry;
      // normalizeSet のタッチの整え方を使う(時刻のまるめ・欄の確かめ)
      const set = normalizeSet({ rallies: [{ id: rallyId, serveTime: 0, plays: entry.plays, flowDone: entry.flowDone }] }, 1);
      const rally = set.rallies[0];
      if (!rally) {
        continue;
      }
      const normalized: IaP1Entry = {};
      if (rally.flowDone) {
        normalized.flowDone = true;
      }
      if (Array.isArray(entry.plays)) {
        normalized.plays = (rally.plays ?? []).map(stripLaterFields);
      }
      output.rallies[rallyId] = normalized;
    }
    return output;
  }
  const plays = input.plays && typeof input.plays === "object" && !Array.isArray(input.plays)
    ? (input.plays as Record<string, unknown>)
    : {};
  const output: IaPlayFieldsData = { plays: {} };
  for (const [playId, raw] of Object.entries(plays)) {
    if (!raw || typeof raw !== "object" || !playId) {
      continue;
    }
    // normalizeSet で欄の値を確かめ、このパスの欄だけを残す
    const set = normalizeSet(
      { rallies: [{ id: "x", serveTime: 0, plays: [{ ...(raw as object), id: playId, team: "*", player: 0, skill: "S" }] }] },
      1,
    );
    const play = set.rallies[0]?.plays?.[0];
    if (!play) {
      continue;
    }
    const fields = pick(play, PASS_PLAY_FIELDS[pass]);
    if (Object.keys(fields).length > 0) {
      output.plays[playId] = fields;
    }
  }
  return output;
}

// ---- 前の形(1つの文書)からの移し替え ----

/**
 * 前の形のセッション(1試合 = 1つの文書)を、メタとスライスに分ける。
 * 中身は変えない(composeSession で組み立て直すと、同じセッションになる)。
 */
export function migrateLegacySession(legacy: InputAssistSession): {
  meta: InputAssistMeta;
  slices: IaSliceDataMap;
} {
  const sets = normalizeSets(legacy.sets);
  return splitSession({ ...legacy, sets });
}

/** メタの文書(新しい形でも、前の形でも)から、準備だけのメタを作る。 */
export function metaFromDocument(document: InputAssistSession | InputAssistMeta): InputAssistMeta {
  return metaOf({ ...document, sets: normalizeSets(document.sets) });
}

export function isSplitDocument(document: object): boolean {
  return (document as { storageVersion?: unknown }).storageVersion === IA_STORAGE_VERSION;
}

// ---- ぶつかったときに合わせる(3方向) ----

export type MergePreference = "mine" | "theirs";

/**
 * id ごとに合わせる。base = 前に読んだ中身、mine = 手元、theirs = サーバーの今。
 * 片方だけが変えたものはその変更を、両方が変えたものは prefer の方を取る。消したものも同じ。
 */
export function mergeRecords<T>(
  base: Record<string, T>,
  mine: Record<string, T>,
  theirs: Record<string, T>,
  prefer: MergePreference,
): Record<string, T> {
  const keys = [...new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)])];
  const output: Record<string, T> = {};
  for (const key of keys) {
    const b = base[key];
    const m = mine[key];
    const t = theirs[key];
    const value = sameData(m, b) ? t : sameData(t, b) ? m : prefer === "mine" ? m : t;
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((entry) => [entry.id, entry]));
}

function mergeLists<T extends { id: string }>(base: T[], mine: T[], theirs: T[], prefer: MergePreference): T[] {
  const merged = mergeRecords(byId(base), byId(mine), byId(theirs), prefer);
  const order = [...theirs, ...mine].map((entry) => entry.id);
  const seen = new Set<string>();
  const output: T[] = [];
  for (const id of order) {
    if (!seen.has(id) && merged[id]) {
      seen.add(id);
      output.push(merged[id]);
    }
  }
  return output;
}

/** 1つのスライスを3方向で合わせる。P0 はラリー・交代・タイムアウトごと、P1 はラリーごと、P2〜P4 はタッチごと。 */
export function mergeSliceData(
  pass: IaPassName,
  base: IaSliceData | undefined,
  mine: IaSliceData | undefined,
  theirs: IaSliceData | undefined,
  prefer: MergePreference,
): IaSliceData {
  if (pass === "P0") {
    const [b, m, t] = [asP0(base), asP0(mine), asP0(theirs)];
    return {
      rallies: mergeLists(b.rallies, m.rallies, t.rallies, prefer).sort(compareRallies),
      substitutions: mergeLists(b.substitutions, m.substitutions, t.substitutions, prefer),
      timeouts: mergeLists(b.timeouts, m.timeouts, t.timeouts, prefer),
    };
  }
  if (pass === "P1") {
    return { rallies: mergeRecords(asP1(base).rallies, asP1(mine).rallies, asP1(theirs).rallies, prefer) };
  }
  return { plays: mergeRecords(asPlayFields(base).plays, asPlayFields(mine).plays, asPlayFields(theirs).plays, prefer) };
}

/** P0 のスライスの、得点の計算に使うラリーの数(一覧に出す)。 */
export function countRalliesInSlice(data: IaSliceData): number {
  return asP0(data).rallies.filter((rally) => rally.status === "rally").length;
}

// ---- サーバーとのやりとりの形 ----

/** データベースに置いたスライス1つ。version は保存するたびに 1 ずつ増える(まだないものは 0)。 */
export type IaSliceRecord = {
  setIndex: number;
  pass: IaPassName;
  version: number;
  data: IaSliceData;
  updatedAt: string | null;
  updatedByName: string | null;
};

/** スライスの版だけ(4 秒ごとに見るもの)。 */
export type IaSliceVersion = Omit<IaSliceRecord, "data">;
