import {
  SERVE_RESULTS,
  addServeTally,
  emptyServeTally,
  formatServeEfficiency,
  rankServes,
  serveAttempts,
  type ServeTally,
} from "@/lib/domain/serve-stats";

type ResultPlayer = { id: string; displayName: string; position: string | null };

type ServeDrillResultProps = {
  // 打つ人(リベロ以外のプレイヤー)。
  players: ResultPlayer[];
  counts: Record<string, ServeTally>;
  // 打つ人(入っていて、まだ打っていない人を下に出す)。
  teams: Record<string, unknown>;
};

/**
 * 1つのメニューの結果(2026-11-10 から。けーいちの依頼)。数える画面の「結果」で出す。
 * 打った人を効果率の高い順に並べ(このメニューだけなので規定の打数はなし)、全体の合計を下に出す。
 * 打つ人に入っていてまだ打っていない人は、いちばん下に「—」で出す。
 */
export function ServeDrillResult({ players, counts, teams }: ServeDrillResultProps) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const ranked = rankServes(
    Object.entries(counts)
      .filter(([id]) => byId.has(id))
      .map(([memberId, tally]) => ({ memberId, ...tally })),
    1,
  );
  const served = new Set(ranked.map((row) => row.memberId));
  const waiting = players.filter((player) => teams[player.id] && !served.has(player.id));
  const sumOf = (ids: string[]) =>
    ids.reduce((sum, id) => addServeTally(sum, counts[id] ?? emptyServeTally()), emptyServeTally());
  const totals: { label: string; tally: ServeTally }[] = [{ label: "全体", tally: sumOf(players.map((player) => player.id)) }];

  if (ranked.length === 0 && waiting.length === 0) {
    return <p className="tp-muted">このメニューのサーブの記録はまだありません。</p>;
  }

  return (
    <div className="tp-card tp-scroll">
      <table className="tp-roster tp-stat-table">
        <thead>
          <tr>
            <th>順位</th>
            <th>選手</th>
            <th>打数</th>
            {SERVE_RESULTS.map((result) => (
              <th key={result}>{result}</th>
            ))}
            <th>効果率</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((row) => {
            const player = byId.get(row.memberId)!;
            return (
              <tr key={row.memberId} className={row.rank === 1 ? "tp-spike-top" : undefined}>
                <td className="tp-num">{row.rank}</td>
                <td>
                  <span className="tp-nowrap">{player.displayName}</span>
                  <span className="tp-sub">{player.position}</span>
                </td>
                <td className="tp-num">{row.attempts}</td>
                {SERVE_RESULTS.map((result) => (
                  <td key={result} className="tp-num">
                    {row[result] || "—"}
                  </td>
                ))}
                <td className="tp-num tp-nowrap">{formatServeEfficiency(row)}</td>
              </tr>
            );
          })}
          {waiting.map((player) => (
            <tr key={player.id} className="tp-stat-empty">
              <td className="tp-num">—</td>
              <td>
                <span className="tp-nowrap">{player.displayName}</span>
                <span className="tp-sub">{player.position}</span>
              </td>
              <td className="tp-num">0</td>
              {SERVE_RESULTS.map((result) => (
                <td key={result} className="tp-num">
                  —
                </td>
              ))}
              <td className="tp-num">—</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {totals.map(({ label, tally }) => (
            <tr key={label} className="tp-spike-top">
              <td />
              <td className="tp-nowrap">{label}</td>
              <td className="tp-num">{serveAttempts(tally)}</td>
              {SERVE_RESULTS.map((result) => (
                <td key={result} className="tp-num">
                  {tally[result] || "—"}
                </td>
              ))}
              <td className="tp-num tp-nowrap">{formatServeEfficiency(tally)}</td>
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
