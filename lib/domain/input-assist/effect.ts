// P2(評価):各タッチの評価(# + ! - / =)を入れる。
// ここには画面から切り離した計算だけを置く(評価の候補・自動で入れる評価・人が決めるタッチの並び・進み具合・注意)。
// 候補は田中のデータの表(effect-prior.ts)から。前後のタッチと点で、ほぼ決まる評価(95% 以上)は自動で入れ、
// 迷う評価だけを人が動画を見て決める。
// 設計:02_Projects/スカウティングAI/設計_打ち込み補助v1.md の「P2 評価」。

import { computeSet, teamCode } from "@/lib/domain/input-assist/engine";
import { EFFECT_PRIOR, type EffectPrior } from "@/lib/domain/input-assist/effect-prior";
import { SKILL_LABELS, isFlowEntered, syncServePlay } from "@/lib/domain/input-assist/flow";
import type { IaPlay, IaRally, IaSet, IaSkill, IaTeamCode } from "@/lib/domain/input-assist/types";

export const IA_EFFECTS = ["#", "+", "!", "-", "/", "="] as const;
export type IaEffect = (typeof IA_EFFECTS)[number];

/** 田中の書き方で、スキルごとに使う評価(どのスキルも6つすべて)。 */
export const VALID_EFFECTS: Record<IaSkill, readonly IaEffect[]> = {
  S: IA_EFFECTS,
  R: IA_EFFECTS,
  E: IA_EFFECTS,
  A: IA_EFFECTS,
  B: IA_EFFECTS,
  D: IA_EFFECTS,
  F: IA_EFFECTS,
};

/** 評価のキー:Shift なしで押せる 1〜6。記号そのもの(# + ! - / =)でも入る。 */
export const EFFECT_KEY_OF: Record<IaEffect, string> = { "#": "1", "+": "2", "!": "3", "-": "4", "/": "5", "=": "6" };
export const EFFECT_BY_KEY: Record<string, IaEffect> = {
  ...Object.fromEntries(IA_EFFECTS.map((effect) => [EFFECT_KEY_OF[effect], effect])),
  ...Object.fromEntries(IA_EFFECTS.map((effect) => [effect, effect])),
};

const RECEIVE_LIKE: Record<IaEffect, string> = {
  "#": "完璧",
  "+": "良い",
  "!": "まあまあ",
  "-": "悪い",
  "/": "返球",
  "=": "ミス",
};

/** 評価の意味(DataVolley の決まりを短く)。 */
export const EFFECT_LABELS: Record<IaSkill, Record<IaEffect, string>> = {
  S: { "#": "エース", "+": "相手を崩した", "!": "少し崩した", "-": "楽に返された", "/": "返球された", "=": "ミス" },
  R: { ...RECEIVE_LIKE, "/": "直接返球" },
  E: RECEIVE_LIKE,
  A: { "#": "決定", "+": "有利", "!": "普通", "-": "不利", "/": "ブロックされた", "=": "ミス" },
  B: { "#": "決定", "+": "有利", "!": "普通", "-": "不利", "/": "不利(相手に)", "=": "ミス" },
  D: RECEIVE_LIKE,
  F: RECEIVE_LIKE,
};

/** 一番の候補がこの割合以上なら、迷わない(自動で入れる)。 */
export const CONFIDENT_PROBABILITY = 0.95;

type ContextPlay = Pick<IaPlay, "team" | "skill">;

/** 表の鍵:「スキル|次のタッチ|最後のタッチの点」(effect-prior.ts)。 */
export function effectContextKey(plays: ContextPlay[], index: number, pointWinner: IaTeamCode): string {
  const play = plays[index];
  const next = plays[index + 1];
  if (next) {
    return `${play.skill}|${next.team === play.team ? "same" : "other"}:${next.skill}|`;
  }
  return `${play.skill}|end|${play.team === pointWinner ? "won" : "lost"}`;
}

export type EffectCandidate = { effect: IaEffect; probability: number };

export type EffectSuggestion = {
  /** 使える評価を、出やすい順に(表にないものは 0)。 */
  candidates: EffectCandidate[];
  top: IaEffect;
  probability: number;
  /** 一番の候補が 95% 以上で、前後のタッチの表から出したもの。自動で入れてよい。 */
  isConfident: boolean;
  contextKey: string;
  /** 表の元になったプレーの数。 */
  sample: number;
  /** 前後のタッチの表から出したか(false = 数が少ないので、スキルだけの表から)。 */
  fromContext: boolean;
};

export function suggestEffect(
  plays: ContextPlay[],
  index: number,
  pointWinner: IaTeamCode,
  prior: EffectPrior = EFFECT_PRIOR,
): EffectSuggestion {
  const play = plays[index];
  const contextKey = effectContextKey(plays, index, pointWinner);
  const byContext = prior.by_context[contextKey];
  const entry = byContext ?? prior.by_skill[play.skill] ?? { n: 0, p: {} };
  const valid = VALID_EFFECTS[play.skill];
  const candidates = valid
    .map((effect) => ({ effect, probability: entry.p[effect] ?? 0 }))
    .sort((left, right) => right.probability - left.probability || valid.indexOf(left.effect) - valid.indexOf(right.effect));
  const [first] = candidates;
  return {
    candidates,
    top: first.effect,
    probability: first.probability,
    // スキルだけの表は、前後が珍しい(入れ間違いかもしれない)ときなので、自動では入れない
    isConfident: byContext !== undefined && first.probability >= CONFIDENT_PROBABILITY,
    contextKey,
    sample: entry.n,
    fromContext: byContext !== undefined,
  };
}

/**
 * ラリーのタッチ(サーブから順に、P1 を入れ終えたもの)ごとの、評価の候補。
 * @param pointWinner このラリーで点を取ったチーム
 */
export function suggestEffects(plays: ContextPlay[], pointWinner: IaTeamCode, prior: EffectPrior = EFFECT_PRIOR): EffectSuggestion[] {
  return plays.map((_, index) => suggestEffect(plays, index, pointWinner, prior));
}

// ---- 評価を入れる ----

/** 人が決めた評価か(VSM から読み込んだ評価も、人が決めたものとして扱う)。 */
export function isManualEffect(play: Pick<IaPlay, "effect" | "effectSource">): boolean {
  return play.effect !== undefined && play.effectSource !== "auto";
}

/**
 * 迷わないタッチに、自動で評価を入れる(effectSource "auto")。
 * - 人が決めた評価(manual・読み込んだもの)は変えない
 * - 自動で入れた評価は、流れが変わったら入れ直す。迷うようになったら消す
 * 変わらなければ、元の配列をそのまま返す。
 */
export function applyAutoEffects(plays: IaPlay[], pointWinner: IaTeamCode, suggestions = suggestEffects(plays, pointWinner)): IaPlay[] {
  let changed = false;
  const next = plays.map((play, index) => {
    if (isManualEffect(play)) {
      return play;
    }
    const suggestion = suggestions[index];
    if (suggestion.isConfident) {
      if (play.effect === suggestion.top && play.effectSource === "auto") {
        return play;
      }
      changed = true;
      return { ...play, effect: suggestion.top, effectSource: "auto" as const };
    }
    if (play.effect === undefined && play.effectSource === undefined) {
      return play;
    }
    changed = true;
    return withoutEffect(play);
  });
  return changed ? next : plays;
}

function withoutEffect(play: IaPlay): IaPlay {
  const rest = { ...play };
  delete rest.effect;
  delete rest.effectSource;
  return rest;
}

/**
 * 人が評価を決める(effect = null で消す)。評価が変わったら、読み込んだときの code は捨てる(書き出すときに作り直す)。
 */
export function setPlayEffect(play: IaPlay, effect: IaEffect | null): IaPlay {
  if (effect === null) {
    const cleared = withoutEffect(play);
    if (play.effect !== undefined) {
      delete cleared.code;
    }
    return cleared;
  }
  const next: IaPlay = { ...play, effect, effectSource: "manual" };
  if (play.effect !== effect) {
    delete next.code;
  }
  return next;
}

// ---- P2 で見るラリー・人が決めるタッチの並び ----

export type EffectRallyEntry = {
  rally: IaRally;
  /** ラリーの番号(得点の計算に使うラリーの中で、1から)。 */
  number: number;
  pointWinner: IaTeamCode;
  /** サーブを先頭に置き、自動の評価を入れたタッチ。 */
  plays: IaPlay[];
  suggestions: EffectSuggestion[];
};

/** P2 で見るラリー:得点の計算に使うラリーで、P1 を入れ終えたもの(時刻の順)。 */
export function effectRallies(set: IaSet): EffectRallyEntry[] {
  const result = computeSet(set);
  const byId = new Map(set.rallies.map((rally) => [rally.id, rally]));
  const entries: EffectRallyEntry[] = [];
  for (const rallyResult of result.rallies) {
    const rally = byId.get(rallyResult.rallyId);
    if (!rally || !isFlowEntered(rally)) {
      continue;
    }
    const pointWinner = teamCode(rallyResult.pointWinner);
    const synced = syncServePlay(rally, rallyResult.servingTeam, rallyResult.server);
    const suggestions = suggestEffects(synced, pointWinner);
    entries.push({
      rally,
      number: rallyResult.number,
      pointWinner,
      plays: applyAutoEffects(synced, pointWinner, suggestions),
      suggestions,
    });
  }
  return entries;
}

/** セットの P1 を入れ終えたラリーに、自動の評価を入れたもの(変わらなければ元のセット)。 */
export function applyAutoEffectsToSet(set: IaSet): IaSet {
  if (set.skipped) {
    return set;
  }
  const changedPlays = new Map<string, IaPlay[]>();
  for (const entry of effectRallies(set)) {
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

export type EffectQueueMode = "unsure" | "all";
export type EffectQueueItem = { rallyId: string; playId: string };

/** 人が見るタッチの並び(ラリーの順、ラリーの中はタッチの順)。unsure = 迷うタッチだけ、all = 全部。 */
export function buildEffectQueue(entries: EffectRallyEntry[], mode: EffectQueueMode): EffectQueueItem[] {
  return entries.flatMap((entry) =>
    entry.plays
      .filter((_, index) => mode === "all" || !entry.suggestions[index].isConfident)
      .map((play) => ({ rallyId: entry.rally.id, playId: play.id })),
  );
}

/** 次に人が決めるタッチ:from より後で評価の決まっていないもの。後になければ先頭から探す。なければ null。 */
export function nextUndecided(
  queue: EffectQueueItem[],
  isDecided: (item: EffectQueueItem) => boolean,
  from: EffectQueueItem | null,
): EffectQueueItem | null {
  const start = from ? queue.findIndex((item) => item.playId === from.playId) + 1 : 0;
  for (let offset = 0; offset < queue.length; offset += 1) {
    const item = queue[(start + offset) % queue.length];
    if (!isDecided(item) && item.playId !== from?.playId) {
      return item;
    }
  }
  return null;
}

// ---- 進み具合 ----

export type IaEffectProgress = {
  setIndex: number;
  /** 評価の決まったタッチ(自動を含む)。 */
  decided: number;
  total: number;
  /** 人が決める(迷う)タッチのうち、まだ決まっていないもの。 */
  remaining: number;
  /** P1 を入れ終えたラリーの数。 */
  rallies: number;
};

export function effectProgress(sets: IaSet[]): IaEffectProgress[] {
  return sets
    .filter((set) => !set.skipped)
    .map((set) => {
      const entries = effectRallies(set);
      let decided = 0;
      let total = 0;
      let remaining = 0;
      for (const entry of entries) {
        entry.plays.forEach((play, index) => {
          total += 1;
          if (play.effect !== undefined) {
            decided += 1;
          } else if (!entry.suggestions[index].isConfident) {
            remaining += 1;
          }
        });
      }
      return { setIndex: set.setIndex, decided, total, remaining, rallies: entries.length };
    });
}

// ---- 注意(止めはしない)----

export type IaEffectHint = { playId: string; message: string };

/**
 * 評価どうし・評価と点が合っていなさそうなところ(決まっている評価だけを見る)。
 * - 最後のタッチ:点を取った側のサーブ・アタック・ブロックなら #、点を取られた側なら = か /
 * - = (ミス)のあとにタッチがある
 * - サーブとレセプション:S # なら R は =、S - なら R は # か +、S + なら R は # でない
 */
export function effectHints(plays: Array<Pick<IaPlay, "id" | "team" | "skill" | "effect">>, pointWinner: IaTeamCode): IaEffectHint[] {
  const hints: IaEffectHint[] = [];
  const label = (skill: IaSkill) => SKILL_LABELS[skill];

  plays.forEach((play, index) => {
    if (play.effect === "=" && index < plays.length - 1) {
      hints.push({ playId: play.id, message: `${label(play.skill)}が = (ミス)なのに、あとにタッチがあります` });
    }
  });

  const last = plays.at(-1);
  if (last?.effect !== undefined) {
    if (last.team === pointWinner && (last.skill === "S" || last.skill === "A" || last.skill === "B") && last.effect !== "#") {
      hints.push({ playId: last.id, message: `最後は点を取った側の${label(last.skill)}です。評価は # では?` });
    } else if (last.team !== pointWinner && last.effect !== "=" && last.effect !== "/") {
      hints.push({ playId: last.id, message: `最後は点を取られた側の${label(last.skill)}です。評価は = では?` });
    }
  }

  const [serve, reception] = plays;
  if (serve?.skill === "S" && reception?.skill === "R" && reception.team !== serve.team && serve.effect && reception.effect) {
    const s = serve.effect;
    const r = reception.effect;
    let message = "";
    if (s === "#" && r !== "=") {
      message = `サーブが # (エース)なのに、レセプションが ${r} です`;
    } else if (r === "=" && s !== "#") {
      message = `レセプションが = (ミス)なら、サーブは # (エース)では?`;
    } else if (s === "-" && (r === "-" || r === "/")) {
      message = `サーブが - (楽に返された)なのに、レセプションが ${r} です`;
    } else if (s === "+" && r === "#") {
      message = "サーブが + (相手を崩した)なのに、レセプションが # です";
    }
    if (message) {
      hints.push({ playId: reception.id, message });
    }
  }
  return hints;
}
