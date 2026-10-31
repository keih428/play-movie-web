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

export type Drill = {
  id: string;
  practiceDate: string;
  name: string;
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

// 肩書がこれを含む人は、集計を付けられる。
const RECORDER_TITLES = ["マネージャー", "アナリスト"];

/** 集計を付けられる人:マネージャー・アナリスト(肩書)と、システム担当。見るのは全員(2026-11-01 にトレーニング担当を外した)。 */
export function canRecordDrillStats(
  member: Pick<Member, "title" | "isSystemAdmin">,
): boolean {
  return (
    member.isSystemAdmin ||
    RECORDER_TITLES.some((title) => member.title?.includes(title) ?? false)
  );
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
