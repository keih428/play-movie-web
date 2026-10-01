import type { SideoutAttackMetricRow } from "@/lib/domain/analysis";

function formatRate(kills: number, attempts: number): string {
  if (attempts === 0) return "-";
  return `${((kills / attempts) * 100).toFixed(1)}%`;
}

function formatMetric(kills: number, attempts: number): string {
  return `${formatRate(kills, attempts)} (${attempts})`;
}

function getTotalAttempts(row: SideoutAttackMetricRow): number {
  return row.abAttempts + row.cAttempts + row.dAttempts;
}

function getTotalKills(row: SideoutAttackMetricRow): number {
  return row.abPassKills + row.cPassKills + row.dPassKills;
}

export function SideoutAttackMetricTable({
  rows,
}: {
  rows: SideoutAttackMetricRow[];
}) {
  const playerRowsWithAttempts = rows.filter(
    (row) => row.label !== "チーム全体" && getTotalAttempts(row) > 0,
  );
  const lowestRate = playerRowsWithAttempts.length > 0
    ? Math.min(
        ...playerRowsWithAttempts.map(
          (row) => getTotalKills(row) / getTotalAttempts(row),
        ),
      )
    : undefined;

  return (
    <div className="score-table-wrap">
      <table className="score-table analysis-player-table">
        <thead>
          <tr>
            <th>アタッカー</th>
            <th>合計決定率</th>
            <th>ABパス</th>
            <th>Cパス</th>
            <th>Dパス</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const totalAttempts = getTotalAttempts(row);
            const totalKills = getTotalKills(row);
            const isLowest =
              typeof lowestRate === "number" &&
              row.label !== "チーム全体" &&
              totalAttempts > 0 &&
              totalKills / totalAttempts === lowestRate;

            return (
              <tr
                key={row.label}
                className={isLowest ? "sideout-lowest-rate-row" : undefined}
              >
                <td data-label="選手">{row.label}</td>
                <td data-label="合計決定率">
                  {formatMetric(totalKills, totalAttempts)}
                </td>
                <td data-label="ABパス">
                  {formatMetric(row.abPassKills, row.abAttempts)}
                </td>
                <td data-label="Cパス">
                  {formatMetric(row.cPassKills, row.cAttempts)}
                </td>
                <td data-label="Dパス">
                  {formatMetric(row.dPassKills, row.dAttempts)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
