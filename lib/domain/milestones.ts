// 月間マイルストーン(2026-10-31 から)。
// 個人:月の初めに各自が決め、ホーム・ノートの上と、ノートの名前の横に出す。
// チーム:月の初めに幹部がホームで決め、ホームに出す。

export const MILESTONE_MAX = 200;

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
