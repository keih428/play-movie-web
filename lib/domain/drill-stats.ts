import type { Member } from "@/lib/domain/portal";

// ---------- マネージャーの集計(練習のメニューごとに、サーブ・ディグを評価ごとに数える。2026-10-31 から) ----------
// 評価は DataVolley の6段階(総合分析・マイプレーと同じ記号)。けーいちの決定、2026-10-31。

export const DRILL_SKILLS = ["serve", "dig"] as const;
export type DrillSkill = (typeof DRILL_SKILLS)[number];

export const DRILL_SKILL_LABELS: Record<DrillSkill, string> = {
  serve: "サーブ",
  dig: "ディグ",
};

export const DRILL_GRADES = ["#", "+", "!", "-", "/", "="] as const;
export type DrillGrade = (typeof DRILL_GRADES)[number];

/** 評価の言葉(スキルごと)。 */
export const DRILL_GRADE_LABELS: Record<DrillSkill, Record<DrillGrade, string>> = {
  serve: {
    "#": "エース",
    "+": "崩した",
    "!": "返された(B)",
    "-": "返された(A)",
    "/": "直接返ってきた",
    "=": "ミス",
  },
  dig: {
    "#": "完璧",
    "+": "攻撃できる",
    "!": "上がった",
    "-": "攻撃できない",
    "/": "相手コートへ",
    "=": "落とした",
  },
};

export const DRILL_NAME_MAX = 40;

// メニューの種類(2026-11-06 から)。サーブ・ディグを評価ごとに数えるか、スパイクの決定と打数を数えるか。
// serving はサーブ効果率(2026-11-10 から。lib/domain/serve-stats.ts)。
export const DRILL_KINDS = ["serve_dig", "spike", "reception", "serving"] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];

export const DRILL_KIND_LABELS: Record<DrillKind, string> = {
  serve_dig: "サーブ・ディグ",
  spike: "スパイク",
  reception: "レセプション",
  serving: "サーブ",
};

export function isDrillKind(value: unknown): value is DrillKind {
  return DRILL_KINDS.includes(value as DrillKind);
}

export type Drill = {
  id: string;
  practiceDate: string;
  name: string;
  kind: DrillKind;
  createdBy: string | null;
  createdAt: string;
};

export type DrillCount = {
  drillId: string;
  memberId: string;
  skill: DrillSkill;
  grade: DrillGrade;
  count: number;
};

/** 評価ごとの本数。 */
export type GradeCounts = Record<DrillGrade, number>;

export function emptyGradeCounts(): GradeCounts {
  return { "#": 0, "+": 0, "!": 0, "-": 0, "/": 0, "=": 0 };
}

export function isDrillSkill(value: unknown): value is DrillSkill {
  return DRILL_SKILLS.includes(value as DrillSkill);
}

export function isDrillGrade(value: unknown): value is DrillGrade {
  return DRILL_GRADES.includes(value as DrillGrade);
}

/** メニューの名前を整える(前後の空白を取り、長すぎるものや空は null)。 */
export function normalizeDrillName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= DRILL_NAME_MAX ? name : null;
}

/**
 * 集計を付けられる人:スタッフ(ポジションのない人)全員と、システム担当。見るのは全員。
 * (2026-11-01 にトレーニング担当を外した。2026-11-08 にマネージャー・アナリストの肩書からスタッフ全員に広げた)
 */
export function canRecordDrillStats(member: Pick<Member, "position" | "isSystemAdmin">): boolean {
  return member.isSystemAdmin || !member.position;
}

/** 本数を「部員 → スキル → 評価」の表にまとめる。 */
export function tableDrillCounts(
  counts: Pick<DrillCount, "memberId" | "skill" | "grade" | "count">[],
): Map<string, Record<DrillSkill, GradeCounts>> {
  const table = new Map<string, Record<DrillSkill, GradeCounts>>();
  for (const entry of counts) {
    const row = table.get(entry.memberId) ?? { serve: emptyGradeCounts(), dig: emptyGradeCounts() };
    row[entry.skill][entry.grade] += entry.count;
    table.set(entry.memberId, row);
  }
  return table;
}

export function totalOf(counts: GradeCounts): number {
  return DRILL_GRADES.reduce((sum, grade) => sum + counts[grade], 0);
}

/** 良い評価(# と +)の割合の%(小数1桁)。本数が0なら null。 */
export function getGoodRate(counts: GradeCounts): number | null {
  const total = totalOf(counts);
  return total === 0 ? null : Math.round(((counts["#"] + counts["+"]) / total) * 1000) / 10;
}

/** ミス(=)の割合の%(小数1桁)。本数が0なら null。 */
export function getErrorRate(counts: GradeCounts): number | null {
  const total = totalOf(counts);
  return total === 0 ? null : Math.round((counts["="] / total) * 1000) / 10;
}

// ---------- 集計のページのタブ(2026-11-06 から。サーブ・ディグ・スパイクを別のタブに) ----------

export const STATS_TABS = ["spike", "reception", "serving", "serve", "dig"] as const;
export type StatsTab = (typeof STATS_TABS)[number];

export const STATS_TAB_LABELS: Record<StatsTab, string> = {
  spike: "スパイク",
  reception: "レセプション",
  serving: "サーブ",
  serve: "サーブ(旧)",
  dig: "ディグ",
};

/**
 * 集計のページに出すタブ。サーブ・ディグは集計を取らなくなったのでアーカイブ(主将の依頼、2026-11-06)。
 * タブには出さないが、?tab=serve / ?tab=dig で開けば、これまでの記録を見られる(コードとデータは残す)。
 */
// サーブ効果率(serving)は 2026-11-10 から。旧サーブ(serve。# + ! - / = で数えていたもの)とは別。
export const VISIBLE_STATS_TABS = ["spike", "reception", "serving"] as const satisfies readonly StatsTab[];

export function isArchivedStatsTab(tab: StatsTab): boolean {
  return !(VISIBLE_STATS_TABS as readonly StatsTab[]).includes(tab);
}

/** ?tab= からタブを決める(前の ?skill=dig のリンクはディグへ。何もなければスパイク)。 */
export function parseStatsTab(tab: unknown, skill?: unknown): StatsTab {
  if (STATS_TABS.includes(tab as StatsTab)) {
    return tab as StatsTab;
  }
  return skill === "dig" ? "dig" : skill === "serve" ? "serve" : "spike";
}

/** タブで作るメニューの種類(サーブ・ディグは同じメニューで両方数えられる)。 */
export function drillKindOfTab(tab: StatsTab): DrillKind {
  return tab === "spike" || tab === "reception" || tab === "serving" ? tab : "serve_dig";
}
