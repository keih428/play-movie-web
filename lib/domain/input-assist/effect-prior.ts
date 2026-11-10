// P2(評価)の候補の元になる表。effect-prior.json はデータとしてそのまま置く(手で編集しない)。
// 出どころ:田中の VSM 50試合・約3.9万プレーから、前後のタッチごとの評価の出やすさを数えたもの
// (scouting-ai の tools/effect_prior.py → data/work/effect_prior.json をコピー)。
//
// 鍵は「スキル|次のタッチ|最後のタッチの点」:
// - 次のタッチ:"same:<スキル>"(同じチーム)/ "other:<スキル>"(相手)/ "end"(ラリーの最後)
// - 最後のタッチの点:"end" のときだけ "won"(このタッチのチームが点を取った)か "lost"。ほかは ""
// 数が 15 未満の組み合わせは入っていない(そのときは by_skill を使う)。
// 一番多い評価を出したときに当たる割合は 77.6%。

import prior from "@/lib/domain/input-assist/effect-prior.json";

export type EffectPriorEntry = {
  /** 数えたプレーの数。 */
  n: number;
  /** 評価ごとの割合(多い順)。 */
  p: Record<string, number>;
};

export type EffectPrior = {
  by_context: Record<string, EffectPriorEntry>;
  by_skill: Record<string, EffectPriorEntry>;
};

export const EFFECT_PRIOR: EffectPrior = prior as EffectPrior;
