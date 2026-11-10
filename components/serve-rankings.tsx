import Link from "next/link";
import { TRAINING_GROUPS, type TrainingGroup } from "@/lib/domain/portal";
import {
  SERVE_EFFECT_RULE,
  SERVE_MIN_ATTEMPTS,
  formatServeEfficiency,
  rankServes,
  type ServeCount,
} from "@/lib/domain/serve-stats";

type ServeRankingsProps = {
  // 切り替えのリンクの元(?tab=serving)。
  basePath: string;
  month: string;
  counts: ServeCount[];
  members: { id: string; displayName: string; group: TrainingGroup | null }[];
};

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
}

/**
 * サーブ効果率の月の順位(2026-11-10 から。主将の依頼)。AB と C で表を分け、効果率の高い順。
 * 規定の打数(月20本)に届かない人は「対象外」。枠のない人は、最後に「枠なし」の表にまとめる。
 */
export function ServeRankings({ basePath, month, counts, members }: ServeRankingsProps) {
  const groupOf = new Map(members.map((member) => [member.id, member.group]));
  const nameOf = (id: string) => members.find((member) => member.id === id)?.displayName ?? "(名簿にいない人)";
  const hrefFor = (nextMonth: string) => `${basePath}&month=${nextMonth}#serving`;
  const [year, monthNumber] = month.split("-").map(Number);
  const tables = [...TRAINING_GROUPS, null].map((group) => ({
    group,
    rows: rankServes(counts.filter((entry) => (groupOf.get(entry.memberId) ?? null) === group)),
  }));

  return (
    <>
      <div className="tp-actions">
        <nav className="tp-seg" aria-label="月">
          <Link href={hrefFor(shiftMonth(month, -1))} scroll={false}>
            ←
          </Link>
          <span aria-current="true">
            {year}年{monthNumber}月
          </span>
          <Link href={hrefFor(shiftMonth(month, 1))} scroll={false}>
            →
          </Link>
        </nav>
      </div>
      <p className="tp-small tp-muted">
        サーブ効果率 =(エース×100 + 効果×25 − ミス×25)÷ 打数。規定の打数は月{SERVE_MIN_ATTEMPTS}本以上です。{SERVE_EFFECT_RULE}。
      </p>
      {tables.every((table) => table.rows.length === 0) ? (
        <p className="tp-muted">この月のサーブの記録はありません。</p>
      ) : null}
      {tables
        .filter((table) => table.group !== null || table.rows.length > 0)
        .map(({ group, rows }) => (
          <div key={group ?? "none"}>
            <h3>{group ?? "枠なし"}</h3>
            {rows.length === 0 ? (
              <p className="tp-small tp-muted">記録はありません。</p>
            ) : (
              <div className="tp-card tp-scroll">
                <table className="tp-roster tp-stat-table">
                  <thead>
                    <tr>
                      <th>順位</th>
                      <th>選手</th>
                      <th>打数</th>
                      <th>エース</th>
                      <th>効果</th>
                      <th>ミス</th>
                      <th>効果率</th>
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
                        <td className="tp-num">{row.ace}</td>
                        <td className="tp-num">{row.effect}</td>
                        <td className="tp-num">{row.miss}</td>
                        <td className="tp-num tp-nowrap">
                          {formatServeEfficiency(row)}
                          {row.rank === null ? "(数が足りない)" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
    </>
  );
}
