import {
  formatEffectRate,
  formatWinRate,
  type MatchTeamSummary,
  type RotationSummaryRow,
  type ServeSummaryRow,
} from "@/lib/domain/match-team-summary";

type Props = {
  summary: MatchTeamSummary;
  /** 背番号 → 表示名(名簿にない背番号は「#15」と出す) */
  names: Record<string, string>;
};

function RotationRow({
  row,
  total,
}: {
  row: RotationSummaryRow;
  total?: boolean;
}) {
  return (
    <tr className={total ? "tp-match-total" : undefined}>
      <th scope="row">{row.label}</th>
      <td className="tp-num tp-nowrap">
        {formatWinRate(row.sideoutWins, row.sideoutAttempts)}
      </td>
      <td className="tp-num tp-nowrap">
        {formatWinRate(row.breakWins, row.breakAttempts)}
      </td>
    </tr>
  );
}

function ServeRow({ row, name }: { row: ServeSummaryRow; name: string }) {
  return (
    <tr className={row.number === null ? "tp-match-total" : undefined}>
      <th scope="row" className="tp-nowrap">
        {name}
      </th>
      <td className="tp-num">{row.attempts}</td>
      <td className="tp-num">{row.aces}</td>
      <td className="tp-num">{row.effective}</td>
      <td className="tp-num">{row.misses}</td>
      <td className="tp-num tp-nowrap">{formatEffectRate(row.effectRate)}</td>
    </tr>
  );
}

/** 「試合」の下に出す、その試合のチームのまとめ。ローテ別のサイドアウト率・ブレイク率と、サーブの成績。 */
export function MatchTeamSummaryView({ summary, names }: Props) {
  return (
    <section
      className="tp-section tp-match-summary"
      aria-label="この試合のチームのまとめ"
    >
      <h2>チームのまとめ</h2>

      <h3>ローテ別のサイドアウト率・ブレイク率</h3>
      {summary.rotations.length === 0 ? (
        <p className="tp-small tp-muted">ローテの記録がありません。</p>
      ) : (
        <div className="tp-card tp-scroll">
          <table className="tp-roster tp-stat-table">
            <thead>
              <tr>
                <th>ローテ</th>
                <th>サイドアウト率</th>
                <th>ブレイク率</th>
              </tr>
            </thead>
            <tbody>
              {summary.rotations.map((row) => (
                <RotationRow key={row.label} row={row} />
              ))}
              <RotationRow row={summary.rotationTotal} total />
            </tbody>
          </table>
        </div>
      )}
      <p className="tp-small tp-muted">
        ローテは自チームのセッターの位置(S1 =
        セッターが1番の位置)。サイドアウト率は相手のサーブのラリーで取った割合、ブレイク率は自分たちのサーブのラリーで取った割合。
      </p>

      <h3>サーブ(効果率の高い順)</h3>
      {summary.serveTeam.attempts === 0 ? (
        <p className="tp-small tp-muted">サーブの記録がありません。</p>
      ) : (
        <div className="tp-card tp-scroll">
          <table className="tp-roster tp-stat-table">
            <thead>
              <tr>
                <th>選手</th>
                <th>打数</th>
                <th>エース</th>
                <th>効果</th>
                <th>ミス</th>
                <th>効果率</th>
              </tr>
            </thead>
            <tbody>
              <ServeRow row={summary.serveTeam} name="チーム全体" />
              {summary.servePlayers.map((row) => (
                <ServeRow
                  key={row.number}
                  row={row}
                  name={names[row.number ?? ""] ?? `#${row.number}`}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tp-small tp-muted">
        サーブ効果率 =(エース×100 + 効果×25 − ミス×25)÷ 打数。
      </p>
    </section>
  );
}
