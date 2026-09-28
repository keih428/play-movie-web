import type { SideoutMetricRow } from "@/lib/domain/analysis";

function formatRate(kills: number, attempts: number): string {
  if (attempts === 0) return "-";
  return `${((kills / attempts) * 100).toFixed(1)}%`;
}

function formatMetric(kills: number, attempts: number): string {
  return `${formatRate(kills, attempts)} (${attempts})`;
}

export function SideoutMetricTable({ rows }: { rows: SideoutMetricRow[] }) {
  return (
    <div className="score-table-wrap">
      <table className="score-table analysis-player-table">
        <thead>
          <tr>
            <th>選手</th>
            <th>合計決定率</th>
            <th>ABパス</th>
            <th>Cパス</th>
            <th>Dパス</th>
            <th>アタックなし</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const totalAttempts =
              row.abAttempts + row.cAttempts + row.dAttempts + row.noAttacks;
            const totalKills =
              row.abPassKills + row.cPassKills + row.dPassKills;

            return (
              <tr key={row.label}>
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
                <td data-label="アタックなし">{row.noAttacks}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
