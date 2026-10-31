// 月間マイルストーン(2026-10-31 から)。
// 個人:月の初めに各自が決め、ホーム・ノートの上と、ノートの名前の横に出す。
// チーム:月の初めに幹部がホームで決め、ホームに出す。

export const MILESTONE_MAX = 200;

// 月末のこの日数のあいだは、来月のマイルストーンを先に決められる(けーいちの決定、2026-10-31:「前の月の最終週から」)。
export const MILESTONE_EARLY_DAYS = 7;

export type MilestoneScope = "member" | "team";

export type Milestone = {
  // チームのマイルストーンでは null。
  memberId: string | null;
  // 'YYYY-MM'
  month: string;
  body: string;
  updatedAt: string;
};

/** 'YYYY-MM-DD' の日付が入っている月('YYYY-MM')。 */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** 'YYYY-MM' を「11月」に。年が違えば「2027年1月」。 */
export function formatMilestoneMonth(month: string, currentMonth?: string): string {
  const [year, index] = month.split("-").map(Number);
  const sameYear = currentMonth ? currentMonth.slice(0, 4) === month.slice(0, 4) : true;
  return sameYear ? `${index}月` : `${year}年${index}月`;
}

/** 部員と月から、表で引くためのキー。 */
export function milestoneKey(memberId: string, month: string): string {
  return `${memberId}|${month}`;
}

/** 書いた文を整える。空なら null、長すぎれば null(呼び出し側で理由を返す)。 */
export function normalizeMilestone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const body = value.trim();
  return body && body.length <= MILESTONE_MAX ? body : null;
}

/** 'YYYY-MM' の次の月。 */
export function nextMonthOf(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 月末の最終週(最後の7日間)なら、来月('YYYY-MM')。それ以外は null。 */
export function getUpcomingMilestoneMonth(today: string): string | null {
  const [year, index, day] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return day > lastDay - MILESTONE_EARLY_DAYS ? nextMonthOf(monthOf(today)) : null;
}

/** 今日決められる月(今月と、月末の最終週なら来月)。過去の月は記録として残すので入らない。 */
export function getEditableMilestoneMonths(today: string): string[] {
  const upcoming = getUpcomingMilestoneMonth(today);
  return upcoming ? [monthOf(today), upcoming] : [monthOf(today)];
}
