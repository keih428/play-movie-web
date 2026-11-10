// P4(種類)の候補の元になる表。type-prior.json はデータとしてそのまま置く(手で編集しない)。
// 出どころ:田中(scout.video.path に "marom" を含むもの)の VSM と latest.vsdb の試合(重なりを除いて 44 試合・約 3.9 万プレー)から、
// scripts/type_prior_build.py で数えたもの(scouting-ai の data/vsm_raw を読むだけ)。
// 数が 15 未満の組み合わせは入っていない(そのときは、より粗い表を使う)。値の "" は「なし」(コンビ・コールを入れない)。
//
// 田中のデータで分かったこと(type.ts の決まりの元):
// - ほかのタッチから写せる欄(copy。写したときに当たる割合):
//   R の種類 = サーブの種類 99.9%、E の種類 = 次のアタックの種類 95.8%、E の targetAttacker = 次のアタックのコンビの targetAttacker 99.5%、
//   A の種類 = コンビの種類 99.0%、B の種類 = 前のアタックの種類 99.9%、B の人数 = 前のアタックのブロックの人数 100%、D の種類 = 前のアタックの種類 99.8%
// - サーブの種類:選手ごとの癖が強い。同じ試合のこれまでのサーブ(serve_history.alpha = 1 で全体の割合と混ぜる)で当てると 85.4%
//   (全体で一番多い M だけなら 62.6%)。95% 以上と出したときは 96.7% 当たる
// - セッターコール:前のタッチ(スキル|評価)の表で 65.3%(全体で一番多いものだけなら 46.5%)。次のアタックのコンビが分かれば 78.5%
// - 攻撃コンビ:アタッカーの前衛・後衛とセッターからの位置(ローテーションでの差 0〜5)とコールで 66.3%、トスの前のタッチの評価も足すと 68.9%、
//   人が押したアタックの始まりのゾーン(P3)も分かれば 82.9%(全体で一番多い PV だけなら 24.1%)
// - アタックの skillType(H 強打・T フェイント・P 軟打):どの鍵でも H が一番(76.5%)
// - ブロックの人数:コンビの表で 66.5%、同じ試合の同じチーム・コンビのこれまで(blockers_history.alpha = 5)を混ぜると 68.7%
// (当たる割合は、試合を2つに分けて、片方で作った表でもう片方を当てたもの。scripts/type_prior_eval.py)

import prior from "@/lib/domain/input-assist/type-prior.json";

export type TypePriorEntry = {
  /** 数えたプレーの数。 */
  n: number;
  /** 値ごとの割合(多い順)。 */
  p: Record<string, number>;
};

export type TypePriorTable = Record<string, TypePriorEntry>;

export type TypePrior = {
  matches: number;
  plays: number;
  /** ほかのタッチから写したときに当たる割合("R<S" など)。 */
  copy: Record<string, number>;
  copy_n: Record<string, number>;
  /** サーブの種類(全体)。 */
  serve: TypePriorEntry;
  /** サーブの種類の、選手のこれまで・チームのこれまでと混ぜる重み。 */
  serve_history: { alpha: number; team_beta: number };
  /** 種類:「スキル|前のスキル|次のタッチ」("A|none" はコンビなしのアタック)。 */
  hit_by_context: TypePriorTable;
  hit_by_skill: TypePriorTable;
  /** セッターコール:「次のアタックのコンビ|前のスキル|前の評価」。 */
  call_by_next: TypePriorTable;
  call_by_next_combo: TypePriorTable;
  /** セッターコール:「前のスキル|前の評価」。 */
  call_by_prev: TypePriorTable;
  call_all: TypePriorEntry;
  /** トスの targetAttacker:コールごと。 */
  target_by_call: TypePriorTable;
  target_all: TypePriorEntry;
  /** 攻撃コンビ:「始まりのゾーン|コール|前衛・後衛|セッターからの位置」。 */
  combo_by_zone: TypePriorTable;
  combo_by_zone_row: TypePriorTable;
  /** 攻撃コンビ:「コール|前衛・後衛|セッターからの位置|トスの前のタッチの評価」。 */
  combo_by_quality: TypePriorTable;
  combo_by_role: TypePriorTable;
  combo_by_row: TypePriorTable;
  combo_all: TypePriorEntry;
  /** アタックの skillType:「アタックの評価|次のスキル」。 */
  skill_type_by_context: TypePriorTable;
  skill_type_all: TypePriorEntry;
  /** ブロックの人数:「コンビ|次のスキル」。 */
  blockers_by_context: TypePriorTable;
  blockers_by_combo: TypePriorTable;
  blockers_all: TypePriorEntry;
  blockers_history: { alpha: number };
  block_players_all: TypePriorEntry;
};

export const TYPE_PRIOR: TypePrior = prior as TypePrior;
