import Link from "next/link";
import type { TrainingGroup } from "@/lib/domain/portal";
import { RECEPTION_MIN_ATTEMPTS, formatPassRate, rankReception, type ReceptionCount } from "@/lib/domain/reception-stats";

type ReceptionRankingsProps = {
  // 切り替えのリンクの元(?tab=reception)。
  basePath: string;
  month: string;
  group: TrainingGroup | "all";
  counts: ReceptionCount[];
  members: { id: string; displayName: string; group: TrainingGroup | null }[];
};

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** レセプションの月の順位(2026-11-06 から。主将の依頼)。ABパス率の高い順、規定の数(月20本)に届かない人は「対象外」。 */
export function ReceptionRankings({ basePath, month, group, counts, members }: ReceptionRankingsProps) {
  const groupOf = new Map(members.map((member) => [member.id, member.group]));
  const nameOf = (id: string) => members.find((member) => member.id === id)?.displayName ?? "(名簿にいない人)";
  const rows = rankReception(counts.filter((entry) => group === "all" || groupOf.get(entry.memberId) === group));
  const hrefFor = (nextMonth: string, nextGroup: TrainingGroup | "all") =>
    `${basePath}&month=${nextMonth}${nextGroup === "all" ? "" : `&group=${nextGroup}`}#reception`;
  const [year, monthNumber] = month.split("-").map(Number);

  return (
    <>
      <div className="tp-actions">
        <nav className="tp-seg" aria-label="月">
          <Link href={hrefFor(shiftMonth(month, -1), group)} scroll={false}>
            ←
          </Link>
          <span aria-current="true">
            {year}年{monthNumber}月
          </span>
          <Link href={hrefFor(shiftMonth(month, 1), group)} scroll={false}>
            →
          </Link>
        </nav>
        <nav className="tp-seg" aria-label="練習の枠">
          {(["all", "AB", "C"] as const).map((entry) => (
            <Link key={entry} href={hrefFor(month, entry)} aria-current={entry === group ? "true" : undefined} scroll={false}>
              {entry === "all" ? "全員" : entry}
            </Link>
          ))}
        </nav>
      </div>
      <p className="tp-small tp-muted">ABパス率の順位。規定の数は月{RECEPTION_MIN_ATTEMPTS}本以上です。</p>
      {rows.length === 0 ? (
        <p className="tp-muted">この月のレセプションの記録はありません。</p>
      ) : (
        <div className="tp-card tp-scroll">
          <table className="tp-roster tp-stat-table">
            <thead>
              <tr>
                <th>順位</th>
                <th>選手</th>
                <th>受けた数</th>
                <th>ABパス</th>
                <th>ABパス率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.memberId}
                  className={row.rank === null ? "tp-spike-out" : row.rank === 1 ? "tp-spike-top" : undefined}
                >
                  <td className="tp-num">{row.rank ?? "対象外"}</td>
                  <td>
                    <span className="tp-nowrap">{nameOf(row.memberId)}</span>
                  </td>
                  <td className="tp-num">{row.attempts}</td>
                  <td className="tp-num">{row.passes}</td>
                  <td className="tp-num tp-nowrap">
                    {formatPassRate(row.passes, row.attempts)}
                    {row.rank === null ? "(数が足りない)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
