// P4(種類):サーブ・トス・アタックの種類、セッターコール・攻撃コンビ、アタックの打ち方、ブロックの人数を入れる。
// ここには画面から切り離した計算だけを置く(欄の候補・自動で入れる種類・人が決めるタッチの並び・進み具合)。
// 候補は田中のデータの表(type-prior.ts)と、このセッションでのこれまで(サーブの種類・ブロックの人数)から。
// ほかのタッチから写せる欄(R の種類 = サーブの種類、など)と、95% 以上の候補は自動で入れ、迷う欄だけを人が動画を見て決める。
// 設計:02_Projects/スカウティングAI/設計_打ち込み補助v1.md の「P4 種類」。

import { computeSet, teamCode } from "@/lib/domain/input-assist/engine";
import { isFlowEntered, sideOfCode, syncServePlay } from "@/lib/domain/input-assist/flow";
import { TYPE_PRIOR, type TypePrior, type TypePriorEntry, type TypePriorTable } from "@/lib/domain/input-assist/type-prior";
import type {
  IaLineup,
  IaPlay,
  IaPosition,
  IaRally,
  IaSet,
  IaSkill,
  IaTeamCode,
  IaTeamSide,
  IaTypeField,
  IaTypeSource,
} from "@/lib/domain/input-assist/types";
import { DEFAULT_ATTACK_COMBINATIONS, DEFAULT_SETTER_CALLS } from "@/lib/domain/input-assist/vsm-defaults";
import { applyZoneChain } from "@/lib/domain/input-assist/zone";

// ---- 欄と、その値 ----

/** スキルごとに入れる欄(人が決めることの多い順。種類は、ほかの欄から写せることが多いので最後)。 */
export const TYPE_FIELDS_BY_SKILL: Record<IaSkill, IaTypeField[]> = {
  S: ["hitType"],
  R: ["hitType"],
  E: ["combination", "targetAttacker", "hitType"],
  A: ["combination", "skillType", "players", "hitType"],
  B: ["players", "hitType"],
  D: ["hitType"],
  F: ["hitType"],
};

export function typeFieldLabel(skill: IaSkill, field: IaTypeField): string {
  switch (field) {
    case "hitType":
      return skill === "S" ? "サーブの種類" : "種類";
    case "combination":
      return skill === "E" ? "コール" : "コンビ";
    case "targetAttacker":
      return "トスの先";
    case "skillType":
      return "打ち方";
    case "players":
      return "ブロック";
  }
}

/** 種類(hitType)の意味。サーブとほかで違う。 */
export const SERVE_HIT_TYPE_LABELS: Record<string, string> = {
  M: "ジャンプフローター",
  Q: "ジャンプサーブ",
  H: "フローター",
  T: "その他",
  O: "その他",
};
export const HIT_TYPE_LABELS: Record<string, string> = {
  H: "ハイセット",
  M: "平行",
  Q: "クイック",
  T: "セミ",
  U: "バック",
  O: "ツーなど",
  N: "スライド",
};
export const SKILL_TYPE_LABELS: Record<string, string> = { H: "強打", T: "フェイント", P: "軟打" };
export const TARGET_LABELS: Record<string, string> = {
  F: "レフト",
  C: "センター",
  B: "ライト",
  P: "パイプ",
  S: "セッター",
  "": "なし",
};

/** よく使う攻撃コンビ・セッターコールの日本語(ないものは一覧の name)。 */
const COMBINATION_LABELS: Record<string, string> = {
  PV: "レフト平行",
  P1: "レフトオープン",
  P2: "レフト短め",
  P3: "センターオープン",
  P4: "ライト短め",
  P5: "ライトオープン",
  PA: "Aクイック",
  PB: "Bクイック",
  PC: "Cクイック",
  PD: "Dクイック",
  PZ: "ライト平行",
  P7: "バックレフト",
  P8: "パイプ",
  P9: "バックライト",
  PX: "セミ",
  PW: "レフトセミ",
  PY: "ライトセミ",
  PS: "セッターアタック",
  PT: "フェイク",
  PU: "レフト短い平行",
  PI: "ライト短い平行",
  KA: "Aクイック",
  KB: "Bクイック",
  KC: "Cクイック",
  KD: "Dクイック",
  KZ: "MB ライト平行",
  KV: "MB レフト平行",
  KK: "アンダー",
};

type CodeEntry = { code?: unknown; name?: unknown; hitType?: unknown; targetAttacker?: unknown };

function findEntry(code: string, list: unknown[]): CodeEntry | undefined {
  return list.find((entry) => (entry as CodeEntry)?.code === code) as CodeEntry | undefined;
}

/** コンビ・コールの短い名前("" は「なし」)。 */
export function combinationLabel(code: string, list: unknown[] = [...DEFAULT_ATTACK_COMBINATIONS, ...DEFAULT_SETTER_CALLS]): string {
  if (!code) {
    return "なし";
  }
  if (COMBINATION_LABELS[code]) {
    return COMBINATION_LABELS[code];
  }
  const name = findEntry(code, list)?.name;
  return typeof name === "string" && name.trim() ? name.trim() : code;
}

/** 欄の値の短い説明。 */
export function typeValueLabel(skill: IaSkill, field: IaTypeField, value: string, lists?: TypeLists): string {
  switch (field) {
    case "hitType":
      return (skill === "S" ? SERVE_HIT_TYPE_LABELS : HIT_TYPE_LABELS)[value] ?? value;
    case "combination":
      return combinationLabel(value, skill === "E" ? (lists?.setterCalls ?? DEFAULT_SETTER_CALLS) : (lists?.combinations ?? DEFAULT_ATTACK_COMBINATIONS));
    case "targetAttacker":
      return TARGET_LABELS[value] ?? value;
    case "skillType":
      return SKILL_TYPE_LABELS[value] ?? value;
    case "players":
      return `${value}人`;
  }
}

function codesOf(list: unknown[]): string[] {
  return list
    .map((entry) => (entry as CodeEntry)?.code)
    .filter((code): code is string => typeof code === "string" && code.length > 0);
}

export type TypeLists = { combinations: unknown[]; setterCalls: unknown[] };

/** 欄に入れられる値("" は「なし」)。表に出てこない値も、ボタンの並びの後ろに出す。 */
export function typeValues(skill: IaSkill, field: IaTypeField, lists: TypeLists): string[] {
  switch (field) {
    case "hitType":
      return skill === "S" ? ["M", "Q", "H"] : ["M", "H", "Q", "T", "U", "O"];
    case "combination":
      return ["", ...codesOf(skill === "E" ? lists.setterCalls : lists.combinations)];
    case "targetAttacker":
      return ["F", "C", "B", "P", "S", ""];
    case "skillType":
      return ["H", "T", "P"];
    case "players":
      return skill === "B" ? ["1", "2", "3"] : ["0", "1", "2", "3"];
  }
}

/** 欄が「なし」(値なし)を選べるか(コンビ・コール・トスの先)。 */
function allowsNone(field: IaTypeField): boolean {
  return field === "combination" || field === "targetAttacker";
}

// ---- タッチの欄を読む・書く ----

function sourceOf(play: Pick<IaPlay, "typeSource">, field: IaTypeField): IaTypeSource | undefined {
  return play.typeSource?.[field];
}

/**
 * 欄の値。"" は「なし」と決めたもの。undefined はまだ決まっていない。
 * VSM から読み込んだタッチ(source なし)は、値がなければ「なし」(田中が入れなかった)。
 */
export function readTypeValue(play: IaPlay, field: IaTypeField): string | undefined {
  const value = play[field];
  if (value !== undefined && value !== null && value !== "") {
    return String(value);
  }
  const source = sourceOf(play, field);
  if (source === "auto" || source === "manual") {
    return "";
  }
  if (source === undefined && play.source === undefined) {
    return "";
  }
  return undefined;
}

export function isTypeDecided(play: IaPlay, field: IaTypeField): boolean {
  return readTypeValue(play, field) !== undefined;
}

/** 人が決めた欄か(VSM から読み込んだ欄も、人が決めたものとして扱う)。 */
export function isManualType(play: IaPlay, field: IaTypeField): boolean {
  return isTypeDecided(play, field) && sourceOf(play, field) !== "auto";
}

/** 人が消した欄か(自動で入れ直さない)。 */
export function isClearedType(play: Pick<IaPlay, "typeSource">, field: IaTypeField): boolean {
  return sourceOf(play, field) === "cleared";
}

/** code に入る欄か(サーブの種類・トスのコール・アタックのコンビ)。 */
function isCodeField(skill: IaSkill, field: IaTypeField): boolean {
  return (skill === "S" && field === "hitType") || ((skill === "E" || skill === "A") && field === "combination");
}

function writeType(play: IaPlay, field: IaTypeField, value: string | null, source: IaTypeSource | undefined): IaPlay {
  const next: IaPlay = { ...play };
  delete next[field];
  if (value !== null && value !== "") {
    if (field === "players") {
      next.players = Number(value);
    } else {
      next[field] = value;
    }
  }
  const sources = { ...(play.typeSource ?? {}) };
  if (source) {
    sources[field] = source;
  } else {
    delete sources[field];
  }
  if (Object.keys(sources).length > 0) {
    next.typeSource = sources;
  } else {
    delete next.typeSource;
  }
  if (next.code !== undefined && isCodeField(play.skill, field) && readTypeValue(next, field) !== readTypeValue(play, field)) {
    delete next.code;
  }
  return next;
}

/**
 * 人が欄を決める。value = null で消す(cleared の印を付け、自動でも入れ直さない。書き出すときは仮のもの)。
 * "" は「なし」(コンビ・コール・トスの先)。code に入る欄が変わったら、読み込んだ code は捨てる。
 */
export function setPlayType(play: IaPlay, field: IaTypeField, value: string | null): IaPlay {
  if (value === null) {
    return writeType(play, field, null, "cleared");
  }
  if (value === "" && !allowsNone(field)) {
    return play;
  }
  return writeType(play, field, value, "manual");
}

// ---- このセッションでのこれまで ----

type Counts = Map<string, number>;

export type TypeHistory = {
  /** サーブの種類:「チーム|背番号」ごと。 */
  serve: Map<string, Counts>;
  /** サーブの種類:チームごと。 */
  serveTeam: Map<string, Counts>;
  /** ブロックの人数:「アタックしたチーム|コンビ」ごと。 */
  blockers: Map<string, Counts>;
};

function addCount(map: Map<string, Counts>, key: string, value: string, delta = 1) {
  const counts = map.get(key) ?? new Map<string, number>();
  counts.set(value, (counts.get(value) ?? 0) + delta);
  map.set(key, counts);
}

export function emptyTypeHistory(): TypeHistory {
  return { serve: new Map(), serveTeam: new Map(), blockers: new Map() };
}

/** セッション(打たないセットを除く)の、人が決めた(読み込んだ)サーブの種類とブロックの人数を数える。 */
export function buildTypeHistory(sets: IaSet[]): TypeHistory {
  const history = emptyTypeHistory();
  for (const set of sets) {
    if (set.skipped) {
      continue;
    }
    for (const rally of set.rallies) {
      for (const play of rally.plays ?? []) {
        if (play.skill === "S" && isManualType(play, "hitType")) {
          const value = readTypeValue(play, "hitType") as string;
          if (value) {
            addCount(history.serve, `${play.team}|${play.player}`, value);
            addCount(history.serveTeam, play.team, value);
          }
        }
        if (play.skill === "A" && isManualType(play, "players")) {
          const combination = readTypeValue(play, "combination");
          const value = readTypeValue(play, "players");
          if (combination !== undefined && value) {
            addCount(history.blockers, `${play.team}|${combination}`, value);
          }
        }
      }
    }
  }
  return history;
}

/** 数え(自分のぶんを除く)。 */
function countsWithout(counts: Counts | undefined, own: string | undefined): { counts: Record<string, number>; n: number } {
  const result: Record<string, number> = {};
  let n = 0;
  for (const [value, count] of counts ?? []) {
    const adjusted = count - (value === own ? 1 : 0);
    if (adjusted > 0) {
      result[value] = adjusted;
      n += adjusted;
    }
  }
  return { counts: result, n };
}

/** これまでの数えと表を混ぜる:(数え + alpha × 表の割合) / (数 + alpha)。 */
function blend(counts: Record<string, number>, n: number, base: Record<string, number>, alpha: number): Record<string, number> {
  const values = new Set([...Object.keys(counts), ...Object.keys(base)]);
  const result: Record<string, number> = {};
  for (const value of values) {
    result[value] = ((counts[value] ?? 0) + alpha * (base[value] ?? 0)) / (n + alpha);
  }
  return result;
}

// ---- 候補 ----

/** 一番の候補がこの割合以上なら、迷わない(自動で入れる)。P2 と同じ。 */
export const CONFIDENT_TYPE_PROBABILITY = 0.95;

export type TypeCandidate = { value: string; probability: number };

export type TypeSuggestion = {
  field: IaTypeField;
  /** 入れられる値を、出やすい順に(表にないものは 0)。 */
  candidates: TypeCandidate[];
  top: string;
  probability: number;
  /** 一番の候補が 95% 以上で、前後のタッチ・これまでから出したもの。自動で入れてよい。 */
  isConfident: boolean;
  /** 何から出したか(画面に出す短い説明)。 */
  basis: string;
  /** 元になったプレーの数。 */
  sample: number;
};

export type TypeContext = {
  /** このラリーのときの並び(アタッカーの前衛・後衛、セッターからの位置に使う)。 */
  lineup?: Record<IaTeamSide, IaLineup>;
  history?: TypeHistory;
  combinations?: unknown[];
  setterCalls?: unknown[];
  prior?: TypePrior;
};

type Lookup = { probs: Record<string, number>; n: number; fromContext: boolean; basis: string };

function fromEntry(entry: TypePriorEntry, fromContext: boolean, basis: string): Lookup {
  return { probs: entry.p, n: entry.n, fromContext, basis };
}

/** 鍵の細かい順に表を探す。どれにもなければ全体の表(fromContext false)。 */
function lookup(tables: Array<[TypePriorTable, string | null]>, fallback: TypePriorEntry, basis = "田中のデータ"): Lookup {
  for (const [table, key] of tables) {
    if (key === null) {
      continue;
    }
    const entry = table[key];
    if (entry) {
      return fromEntry(entry, true, basis);
    }
  }
  return fromEntry(fallback, false, `${basis}(全体)`);
}

/** 写す:写した値を rate、残りを表の割合 × (1 − rate)。 */
function copied(value: string, rate: number, rest: Lookup, basis: string, n: number): Lookup {
  const probs: Record<string, number> = {};
  for (const [key, probability] of Object.entries(rest.probs)) {
    if (key !== value) {
      probs[key] = probability * (1 - rate);
    }
  }
  probs[value] = rate;
  return { probs, n, fromContext: true, basis };
}

function makeSuggestion(field: IaTypeField, values: string[], found: Lookup): TypeSuggestion {
  const candidates = values
    .map((value) => ({ value, probability: found.probs[value] ?? 0 }))
    .sort((left, right) => right.probability - left.probability || values.indexOf(left.value) - values.indexOf(right.value));
  const [first] = candidates;
  return {
    field,
    candidates,
    top: first.value,
    probability: first.probability,
    isConfident: found.fromContext && first.probability >= CONFIDENT_TYPE_PROBABILITY,
    basis: found.basis,
    sample: found.n,
  };
}

function nextKey(play: IaPlay, next: IaPlay | undefined): string {
  if (!next) {
    return "end";
  }
  return `${next.team === play.team ? "same" : "other"}:${next.skill}`;
}

/** アタッカーの前衛・後衛と、セッターからの位置(ローテーションでの差 0〜5)。コートにいなければ L(リベロなど)。 */
export function attackerRole(lineup: IaLineup | undefined, player: number): { row: string; offset: string } | null {
  if (!lineup) {
    return null;
  }
  const entries = Object.entries(lineup.positions) as Array<[IaPosition, number | null]>;
  if (entries.every(([, shirt]) => shirt === null)) {
    return null;
  }
  const found = entries.find(([, shirt]) => shirt === player);
  if (!found) {
    return { row: "L", offset: "L" };
  }
  const position = Number(found[0]);
  return {
    row: position >= 2 && position <= 4 ? "front" : "back",
    offset: String((((position - lineup.setterAt) % 6) + 6) % 6),
  };
}

function hitContext(plays: IaPlay[], index: number, prior: TypePrior): Lookup {
  const play = plays[index];
  const previous = plays[index - 1];
  const key = `${play.skill}|${previous?.skill ?? "-"}|${nextKey(play, plays[index + 1])}`;
  return lookup([[prior.hit_by_context, key]], prior.hit_by_skill[play.skill] ?? { n: 0, p: {} });
}

function suggestHitType(plays: IaPlay[], index: number, context: Required<Pick<TypeContext, "prior">> & TypeContext, lists: TypeLists): Lookup {
  const { prior } = context;
  const play = plays[index];
  const previous = plays[index - 1];
  const next = plays[index + 1];
  const rest = hitContext(plays, index, prior);
  const copy = (key: string, value: string | undefined, basis: string) =>
    value ? copied(value, prior.copy[key] ?? 0.95, rest, basis, prior.copy_n[key] ?? 0) : null;

  switch (play.skill) {
    case "S": {
      // 選手ごとの癖:このセッションのこれまで → チームのこれまで → 田中のデータ全体
      const { alpha, team_beta: beta } = prior.serve_history;
      const own = isManualType(play, "hitType") ? readTypeValue(play, "hitType") : undefined;
      const team = countsWithout(context.history?.serveTeam.get(play.team), own);
      const player = countsWithout(context.history?.serve.get(`${play.team}|${play.player}`), own);
      const base = blend(team.counts, team.n, prior.serve.p, beta);
      const probs = blend(player.counts, player.n, base, alpha);
      if (player.n > 0) {
        return { probs, n: player.n, fromContext: true, basis: `${play.player}番のこれまでのサーブ ${player.n}本` };
      }
      return { probs, n: team.n || prior.serve.n, fromContext: false, basis: team.n > 0 ? "チームのこれまでのサーブ" : "田中のデータ(全体)" };
    }
    case "R":
      if (previous?.skill === "S") {
        return copy("R<S", readTypeValue(previous, "hitType"), "サーブの種類から") ?? rest;
      }
      return rest;
    case "E":
      if (next?.skill === "A" && next.team === play.team) {
        return copy("E<A", readTypeValue(next, "hitType"), "次のアタックの種類から") ?? rest;
      }
      return rest;
    case "A": {
      const combination = readTypeValue(play, "combination");
      if (combination === "") {
        return lookup([[prior.hit_by_context, "A|none"]], prior.hit_by_skill.A);
      }
      const hitType = combination ? findEntry(combination, lists.combinations)?.hitType : undefined;
      return copy("A<combo", typeof hitType === "string" ? hitType : undefined, "コンビの種類から") ?? rest;
    }
    case "B":
      if (previous?.skill === "A") {
        return copy("B<A", readTypeValue(previous, "hitType"), "アタックの種類から") ?? rest;
      }
      return rest;
    case "D":
      if (previous?.skill === "A") {
        return copy("D<A", readTypeValue(previous, "hitType"), "アタックの種類から") ?? rest;
      }
      return rest;
    default:
      return rest;
  }
}

/** 同じチームの、すぐあとのアタック。 */
function followingAttack(plays: IaPlay[], index: number): IaPlay | undefined {
  const next = plays[index + 1];
  return next?.skill === "A" && next.team === plays[index].team ? next : undefined;
}

function suggestCombination(plays: IaPlay[], index: number, context: Required<Pick<TypeContext, "prior">> & TypeContext): Lookup {
  const { prior } = context;
  const play = plays[index];
  const previous = plays[index - 1];
  if (play.skill === "E") {
    const ps = previous?.skill ?? "-";
    const pe = previous?.effect ?? "";
    const attack = followingAttack(plays, index);
    // 次のアタックのコンビ(人が決めたものだけ。自動のものから決めると、行ったり来たりする)
    const nc = attack && isManualType(attack, "combination") ? (readTypeValue(attack, "combination") as string) : null;
    return lookup(
      [
        [prior.call_by_next, nc === null ? null : `${nc}|${ps}|${pe}`],
        [prior.call_by_next_combo, nc],
        [prior.call_by_prev, `${ps}|${pe}`],
      ],
      prior.call_all,
    );
  }
  // アタック:前衛・後衛とセッターからの位置、トスのコール、トスの前のタッチの評価、人が押した始まりのゾーン
  const role = attackerRole(context.lineup?.[sideOfCode(play.team)], play.player);
  const setBefore = previous?.skill === "E" && previous.team === play.team ? previous : undefined;
  const call = setBefore ? (isManualType(setBefore, "combination") ? (readTypeValue(setBefore, "combination") as string) : null) : "";
  const quality = setBefore ? (plays[index - 2]?.effect ?? "") : "";
  const zone = play.startZone !== undefined && play.startZoneSource !== "auto" ? String(play.startZone) : null;
  const roleKey = role ? `${role.row}|${role.offset}` : null;
  return lookup(
    [
      [prior.combo_by_zone, zone !== null && call !== null && roleKey ? `${zone}|${call}|${roleKey}` : null],
      [prior.combo_by_zone_row, zone !== null && role ? `${zone}|${role.row}` : null],
      [prior.combo_by_quality, call !== null && roleKey ? `${call}|${roleKey}|${quality}` : null],
      [prior.combo_by_role, call !== null && roleKey ? `${call}|${roleKey}` : null],
      [prior.combo_by_row, roleKey],
    ],
    prior.combo_all,
  );
}

function suggestTarget(plays: IaPlay[], index: number, context: Required<Pick<TypeContext, "prior">> & TypeContext, lists: TypeLists): Lookup {
  const { prior } = context;
  const play = plays[index];
  const call = readTypeValue(play, "combination");
  const rest = lookup([[prior.target_by_call, call ?? null]], prior.target_all);
  const attack = followingAttack(plays, index);
  const combination = attack ? readTypeValue(attack, "combination") : undefined;
  const target = combination ? findEntry(combination, lists.combinations)?.targetAttacker : undefined;
  if (typeof target === "string" && target) {
    return copied(target, prior.copy["target<combo"] ?? 0.95, rest, "次のアタックのコンビから", prior.copy_n["target<combo"] ?? 0);
  }
  return rest;
}

function suggestSkillType(plays: IaPlay[], index: number, prior: TypePrior): Lookup {
  const play = plays[index];
  const next = plays[index + 1];
  return lookup([[prior.skill_type_by_context, `${play.effect ?? ""}|${next?.skill ?? "end"}`]], prior.skill_type_all);
}

function suggestPlayers(plays: IaPlay[], index: number, context: Required<Pick<TypeContext, "prior">> & TypeContext): Lookup {
  const { prior } = context;
  const play = plays[index];
  const previous = plays[index - 1];
  if (play.skill === "B") {
    const value = previous?.skill === "A" ? readTypeValue(previous, "players") : undefined;
    const rest = fromEntry(prior.block_players_all, false, "田中のデータ(全体)");
    return value ? copied(value, prior.copy["Bplayers<A"] ?? 0.95, rest, "アタックのブロックの人数から", prior.copy_n["Bplayers<A"] ?? 0) : rest;
  }
  const next = plays[index + 1];
  const combination = readTypeValue(play, "combination");
  const base = lookup(
    [
      [prior.blockers_by_context, combination === undefined ? null : `${combination}|${next?.skill ?? "end"}`],
      [prior.blockers_by_combo, combination ?? null],
    ],
    prior.blockers_all,
  );
  if (combination === undefined) {
    return base;
  }
  // 同じセッションの、同じチーム・コンビのこれまでを混ぜる
  const own = isManualType(play, "players") ? readTypeValue(play, "players") : undefined;
  const history = countsWithout(context.history?.blockers.get(`${play.team}|${combination}`), own);
  if (history.n === 0) {
    return base;
  }
  return {
    probs: blend(history.counts, history.n, base.probs, prior.blockers_history.alpha),
    n: base.n,
    fromContext: base.fromContext,
    basis: `${base.basis}+この試合の ${history.n}本`,
  };
}

export type TouchTypeSuggestions = Partial<Record<IaTypeField, TypeSuggestion>>;

/**
 * ラリーのタッチ(サーブから順に)ごとの、欄の候補。
 * 前後のタッチの値は、写す欄(種類・トスの先・ブロックの人数)では自動のものも使い、
 * コール・コンビ・サーブの種類では人が決めたものだけを使う(自動どうしで決め合わないように)。
 */
export function suggestTypes(plays: IaPlay[], context: TypeContext = {}): TouchTypeSuggestions[] {
  const full = { ...context, prior: context.prior ?? TYPE_PRIOR };
  const lists: TypeLists = {
    combinations: context.combinations ?? DEFAULT_ATTACK_COMBINATIONS,
    setterCalls: context.setterCalls ?? DEFAULT_SETTER_CALLS,
  };
  return plays.map((play, index) => {
    const result: TouchTypeSuggestions = {};
    for (const field of TYPE_FIELDS_BY_SKILL[play.skill]) {
      let found: Lookup;
      switch (field) {
        case "hitType":
          found = suggestHitType(plays, index, full, lists);
          break;
        case "combination":
          found = suggestCombination(plays, index, full);
          break;
        case "targetAttacker":
          found = suggestTarget(plays, index, full, lists);
          break;
        case "skillType":
          found = suggestSkillType(plays, index, full.prior);
          break;
        case "players":
          found = suggestPlayers(plays, index, full);
          break;
      }
      result[field] = makeSuggestion(field, typeValues(play.skill, field, lists), found);
    }
    return result;
  });
}

// ---- 自動で入れる ----

function sameTypes(left: IaPlay, right: IaPlay): boolean {
  if (left === right) {
    return true;
  }
  const fields = TYPE_FIELDS_BY_SKILL[left.skill];
  return (
    fields.every((field) => left[field] === right[field] && sourceOf(left, field) === sourceOf(right, field)) &&
    left.code === right.code
  );
}

function withoutAutoTypes(play: IaPlay): IaPlay {
  let next = play;
  for (const field of TYPE_FIELDS_BY_SKILL[play.skill]) {
    if (sourceOf(next, field) === "auto") {
      next = writeType(next, field, null, undefined);
    }
  }
  return next;
}

/**
 * 迷わない欄に、自動で種類を入れる(typeSource "auto")。
 * 1. 自動で入れた欄をいったん消す
 * 2. 95% 以上の候補(写せる欄を含む)を入れる。入れた値から、さらに写せる欄が決まるので、決まらなくなるまでくり返す
 * 人が決めた欄・人が消した欄・VSM から読み込んだタッチは変えない。変わらなければ、元の配列をそのまま返す。
 */
export function applyAutoTypes(plays: IaPlay[], context: TypeContext = {}): IaPlay[] {
  let next = plays.map((play) => (play.source === undefined ? play : withoutAutoTypes(play)));
  for (let round = 0; round < 6; round += 1) {
    const suggestions = suggestTypes(next, context);
    let filled = false;
    next = next.map((play, index) => {
      if (play.source === undefined) {
        return play;
      }
      let updated = play;
      for (const field of TYPE_FIELDS_BY_SKILL[play.skill]) {
        const suggestion = suggestions[index][field];
        if (!suggestion?.isConfident || isTypeDecided(updated, field) || isClearedType(updated, field)) {
          continue;
        }
        updated = writeType(updated, field, suggestion.top, "auto");
        filled = true;
      }
      return updated;
    });
    if (!filled) {
      break;
    }
  }
  let changed = false;
  const result = next.map((play, index) => {
    const original = plays[index];
    if (sameTypes(play, original)) {
      return original;
    }
    changed = true;
    return play;
  });
  return changed ? result : plays;
}

/** 種類を入れたあと、攻撃コンビから分かるアタックの始まり(P3)も入れ直す。 */
export function applyTypesAndZones(plays: IaPlay[], context: TypeContext = {}): IaPlay[] {
  return applyZoneChain(applyAutoTypes(plays, context), context.combinations ?? DEFAULT_ATTACK_COMBINATIONS);
}

// ---- P4 で見るラリー・人が決めるタッチの並び ----

export type TypeRallyEntry = {
  rally: IaRally;
  /** ラリーの番号(得点の計算に使うラリーの中で、1から)。 */
  number: number;
  pointWinner: IaTeamCode;
  lineup: Record<IaTeamSide, IaLineup>;
  /** サーブを先頭に置き、自動の種類(とゾーン)を入れたタッチ。 */
  plays: IaPlay[];
  suggestions: TouchTypeSuggestions[];
};

export type TypeSetOptions = { history?: TypeHistory; combinations?: unknown[]; setterCalls?: unknown[] };

/** P4 で見るラリー:得点の計算に使うラリーで、P1 を入れ終えたもの(時刻の順)。 */
export function typeRallies(set: IaSet, options: TypeSetOptions = {}): TypeRallyEntry[] {
  const result = computeSet(set);
  const history = options.history ?? buildTypeHistory([set]);
  const byId = new Map(set.rallies.map((rally) => [rally.id, rally]));
  const entries: TypeRallyEntry[] = [];
  for (const rallyResult of result.rallies) {
    const rally = byId.get(rallyResult.rallyId);
    if (!rally || !isFlowEntered(rally)) {
      continue;
    }
    const context: TypeContext = { ...options, history, lineup: rallyResult.lineup };
    const synced = syncServePlay(rally, rallyResult.servingTeam, rallyResult.server);
    const plays = applyTypesAndZones(synced, context);
    entries.push({
      rally,
      number: rallyResult.number,
      pointWinner: teamCode(rallyResult.pointWinner),
      lineup: rallyResult.lineup,
      plays,
      suggestions: suggestTypes(plays, context),
    });
  }
  return entries;
}

/** セットの P1 を入れ終えたラリーに、自動の種類を入れたもの(変わらなければ元のセット)。 */
export function applyAutoTypesToSet(set: IaSet, options: TypeSetOptions = {}): IaSet {
  if (set.skipped) {
    return set;
  }
  const changedPlays = new Map<string, IaPlay[]>();
  for (const entry of typeRallies(set, options)) {
    const stored = entry.rally.plays ?? [];
    const same = stored.length === entry.plays.length && stored.every((play, index) => play === entry.plays[index]);
    if (!same) {
      changedPlays.set(entry.rally.id, entry.plays);
    }
  }
  if (changedPlays.size === 0) {
    return set;
  }
  return {
    ...set,
    rallies: set.rallies.map((rally) => (changedPlays.has(rally.id) ? { ...rally, plays: changedPlays.get(rally.id) } : rally)),
  };
}

/** 人が見る欄か:迷う(95% 未満)か、人が消したもの。 */
export function isUnsureField(play: IaPlay, suggestion: TypeSuggestion | undefined, field: IaTypeField): boolean {
  return play.source !== undefined && (!suggestion?.isConfident || isClearedType(play, field));
}

/** タッチの、人が見る欄(並びの順)。mode all ならタッチの欄すべて。 */
export function fieldsToReview(play: IaPlay, suggestions: TouchTypeSuggestions, mode: TypeQueueMode): IaTypeField[] {
  const fields = TYPE_FIELDS_BY_SKILL[play.skill];
  return mode === "all" ? fields : fields.filter((field) => isUnsureField(play, suggestions[field], field));
}

export type TypeQueueMode = "unsure" | "all";
export type TypeQueueItem = { rallyId: string; playId: string };

/**
 * P4 で見るタッチの順(タッチの番号)。トスのすぐあとに同じチームのアタックがあれば、アタックを先にする
 * (アタックのコンビが決まると、コールの当たり方が 65% → 79% に上がる)。ほかはタッチの順。
 */
export function typeReviewOrder(plays: Array<Pick<IaPlay, "team" | "skill">>): number[] {
  const order: number[] = [];
  for (let index = 0; index < plays.length; index += 1) {
    const next = plays[index + 1];
    if (plays[index].skill === "E" && next?.skill === "A" && next.team === plays[index].team) {
      order.push(index + 1, index);
      index += 1;
    } else {
      order.push(index);
    }
  }
  return order;
}

/** 人が見るタッチの並び(ラリーの順、ラリーの中は typeReviewOrder の順)。unsure = 迷う欄・人が消した欄のあるタッチ、all = 全部。 */
export function buildTypeQueue(entries: TypeRallyEntry[], mode: TypeQueueMode): TypeQueueItem[] {
  return entries.flatMap((entry) =>
    typeReviewOrder(entry.plays)
      .filter((index) => fieldsToReview(entry.plays[index], entry.suggestions[index], mode).length > 0)
      .map((index) => ({ rallyId: entry.rally.id, playId: entry.plays[index].id })),
  );
}

/** タッチの、まだ決まっていない欄。 */
export function undecidedFields(play: IaPlay): IaTypeField[] {
  return TYPE_FIELDS_BY_SKILL[play.skill].filter((field) => !isTypeDecided(play, field));
}

// ---- 進み具合 ----

export type IaTypeProgress = {
  setIndex: number;
  /** 決まった欄(自動を含む)。 */
  decided: number;
  total: number;
  /** 人が決める(迷う・人が消した)欄のうち、まだ決まっていないもの。 */
  remaining: number;
  /** P1 を入れ終えたラリーの数。 */
  rallies: number;
};

export function typeProgress(sets: IaSet[], options: Omit<TypeSetOptions, "history"> = {}): IaTypeProgress[] {
  const history = buildTypeHistory(sets);
  return sets
    .filter((set) => !set.skipped)
    .map((set) => {
      const entries = typeRallies(set, { ...options, history });
      let decided = 0;
      let total = 0;
      let remaining = 0;
      for (const entry of entries) {
        entry.plays.forEach((play, index) => {
          for (const field of TYPE_FIELDS_BY_SKILL[play.skill]) {
            total += 1;
            if (isTypeDecided(play, field)) {
              decided += 1;
            } else if (isUnsureField(play, entry.suggestions[index][field], field)) {
              remaining += 1;
            }
          }
        });
      }
      return { setIndex: set.setIndex, decided, total, remaining, rallies: entries.length };
    });
}
