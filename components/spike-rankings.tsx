import Link from "next/link";
import type { TrainingGroup } from "@/lib/domain/portal";
import {
  SERVE_LEVEL_LABELS,
  SPIKE_MIN_ATTEMPTS,
  SPIKE_SPOTS,
  SPIKE_SPOT_LABELS,
  formatSpikeRate,
  rankSetters,
  rankSpikers,
  type KillsAttempts,
  type SpikeCount,
} from "@/lib/domain/spike-stats";

type SpikeRankingsProps = {
  // 切り替えのリンクの元(?skill=… まで付いたもの)。
  basePath: string;
  month: string;
  group: TrainingGroup | "all";
  counts: SpikeCount[];
  members: { id: string; displayName: string; group: TrainingGroup | null }[];
};

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

const cellText = (cell: KillsAttempts | undefined) =>
  cell && cell.attempts ? `${cell.kills} / ${cell.attempts} (${formatSpikeRate(cell.kills, cell.attempts)})` : "—";

/**
 * スパイクの月の順位(2026-11-06 から。主将の資料「ドリル_スパイク練習」の 3.2・3.3 の表)。
 * スパイカーは位置ごと(前衛 OH・OP はサーブのレベル別)、規定打数(月20打)に届かない人は「対象外」。
 * セッターは、トスを上げた位置ごとの決定/打数と、合計の決定率の順位。
 */
export function SpikeRankings({ basePath, month, group, counts, members }: SpikeRankingsProps) {
  const groupOf = new Map(members.map((member) => [member.id, member.group]));
  const nameOf = (id: string) => members.find((member) => member.id === id)?.displayName ?? "(名簿にいない人)";
  const inGroup = (id: string) => group === "all" || groupOf.get(id) === group;
  const spikerCounts = counts.filter((entry) => inGroup(entry.memberId));
  const setterCounts = counts.filter((entry) => inGroup(entry.setterId));
  const tables = rankSpikers(spikerCounts);
  const setters = rankSetters(setterCounts);
  // スパイカーの表の列に出すセッター(この月にトスを上げた人)。
  const setterColumns = [...new Set(spikerCounts.map((entry) => entry.setterId))];
  const hrefFor = (nextMonth: string, nextGroup: TrainingGroup | "all") =>
    `${basePath}&month=${nextMonth}${nextGroup === "all" ? "" : `&group=${nextGroup}`}#spike`;
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
      <p className="tp-small tp-muted">
        規定打数は月{SPIKE_MIN_ATTEMPTS}打以上。サーブを受けてから打つ前衛 OH・OP は、サーブのレベル別に分けます。
      </p>

      {tables.length === 0 ? <p className="tp-muted">この月のスパイクの記録はありません。</p> : null}
      {tables.map((table) => (
        <div key={`${table.spot}-${table.level}`}>
          <h3 className="tp-spike-rank-title">
            {SPIKE_SPOT_LABELS[table.spot]}
            {table.level ? `(Lv${table.level} ${SERVE_LEVEL_LABELS[table.level]})` : table.spot === "MB" ? "(サーブなし)" : ""}
          </h3>
          <div className="tp-card tp-scroll">
            <table className="tp-roster tp-stat-table">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>選手</th>
                  {setterColumns.map((id) => (
                    <th key={id}>
                      {nameOf(id)}
                      <span className="tp-sub">決定/打数</span>
                    </th>
                  ))}
                  <th>総打数</th>
                  <th>決定数</th>
                  <th>決定率</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr
                    key={row.memberId}
                    className={row.rank === null ? "tp-spike-out" : row.rank === 1 ? "tp-spike-top" : undefined}
                  >
                    <td className="tp-num">{row.rank ?? "対象外"}</td>
                    <td>
                      <span className="tp-nowrap">{nameOf(row.memberId)}</span>
                    </td>
                    {setterColumns.map((id) => (
                      <td key={id} className="tp-num tp-nowrap">
                        {cellText(row.bySetter.get(id))}
                      </td>
                    ))}
                    <td className="tp-num">{row.attempts}</td>
                    <td className="tp-num">{row.kills}</td>
                    <td className="tp-num tp-nowrap">
                      {formatSpikeRate(row.kills, row.attempts)}
                      {row.rank === null ? "(打数不足)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {setters.setterIds.length > 0 ? (
        <>
          <h3 className="tp-spike-rank-title">セッター</h3>
          <div className="tp-card tp-scroll">
            <table className="tp-roster tp-stat-table">
              <thead>
                <tr>
                  <th>スパイク位置</th>
                  {setters.setterIds.map((id) => (
                    <th key={id}>
                      {nameOf(id)}
                      <span className="tp-sub">決定/打数</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SPIKE_SPOTS.filter((spot) => setters.bySpot.has(spot)).map((spot) => (
                  <tr key={spot}>
                    <td className="tp-nowrap">{SPIKE_SPOT_LABELS[spot]}</td>
                    {setters.setterIds.map((id) => (
                      <td key={id} className="tp-num tp-nowrap">
                        {cellText(setters.bySpot.get(spot)?.get(id))}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="tp-spike-top">
                  <td>合計</td>
                  {setters.setterIds.map((id) => (
                    <td key={id} className="tp-num tp-nowrap">
                      {cellText(setters.totals.get(id))}
                    </td>
                  ))}
                </tr>
                <tr className="tp-spike-top">
                  <td>順位</td>
                  {setters.setterIds.map((id) => (
                    <td key={id} className="tp-num">
                      {setters.ranks.get(id)}位
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
