import type { MemberPosition } from "@/lib/domain/portal";

// ---------- レセプションの集計(2026-11-06 から。主将の依頼) ----------
// サーブを受けるたびに「ABパス」か「それ以外」かを数え、月ごとに ABパス率 の順位を出す。

/** 月の順位に載る受けた数(月20本以上。スパイクの規定打数にそろえた)。 */
export const RECEPTION_MIN_ATTEMPTS = 20;

export type ReceptionCount = {
  memberId: string;
  // ABパスの数。
  passes: number;
  // 受けた数(ABパス + それ以外)。
  attempts: number;
};

export type ReceptionSetup = {
  // このメニューで受ける人(画面に並べる順)。
  members: string[];
};

/** 最初に選ぶ受ける人:サーブレシーブをするポジション(OH・OP・リベロ。OP は 2026-11-07 から)。 */
export function isDefaultReceiver(position: MemberPosition | null): boolean {
  return position === "OH" || position === "OP" || position === "Li";
}

export function formatPassRate(passes: number, attempts: number): string {
  return attempts === 0 ? "—" : `${((passes / attempts) * 100).toFixed(1)}%`;
}

export type ReceptionRow = ReceptionCount & {
  // 規定の数に届いていれば順位(同じ率は同じ順位)、届かなければ null(対象外)。
  rank: number | null;
};

/** ABパス率の順位。率の高い順で、規定の数に届かない人は下に「対象外」。 */
export function rankReception(counts: ReceptionCount[], minAttempts = RECEPTION_MIN_ATTEMPTS): ReceptionRow[] {
  const byMember = new Map<string, ReceptionRow>();
  for (const entry of counts) {
    const row = byMember.get(entry.memberId) ?? { memberId: entry.memberId, passes: 0, attempts: 0, rank: null };
    row.passes += entry.passes;
    row.attempts += entry.attempts;
    byMember.set(entry.memberId, row);
  }
  const rows = [...byMember.values()].filter((row) => row.attempts > 0);
  const qualified = (row: ReceptionRow) => row.attempts >= minAttempts;
  rows.sort(
    (a, b) =>
      Number(qualified(b)) - Number(qualified(a)) ||
      b.passes / b.attempts - a.passes / a.attempts ||
      b.attempts - a.attempts,
  );
  let previous: ReceptionRow | null = null;
  rows.forEach((row, index) => {
    if (!qualified(row)) {
      return;
    }
    row.rank = previous && previous.passes * row.attempts === row.passes * previous.attempts ? previous.rank : index + 1;
    previous = row;
  });
  return rows;
}

const MAX_RECEIVERS = 200;

/** 受ける人の選び方を読む(形の合わないところは捨てる)。読めなければ null。 */
export function parseReceptionSetup(value: unknown): ReceptionSetup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const members = (value as { members?: unknown }).members;
  if (!Array.isArray(members)) {
    return null;
  }
  return {
    members: [...new Set(members.filter((id): id is string => typeof id === "string"))].slice(0, MAX_RECEIVERS),
  };
}
