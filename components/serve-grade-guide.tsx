import { SERVE_GRADE_GUIDE } from "@/lib/domain/serve-stats";

/** サーブの記号の意味と、効果率での扱いの表(2026-11-10 から。けーいちの依頼)。ふだんは畳んでおく。 */
export function ServeGradeGuide() {
  return (
    <details className="tp-ref tp-serve-guide">
      <summary>記号の意味と効果率の基準</summary>
      <div className="tp-ref-body">
        <table className="tp-roster tp-stat-table">
          <thead>
            <tr>
              <th>記号</th>
              <th>意味</th>
              <th>効果率では</th>
            </tr>
          </thead>
          <tbody>
            {SERVE_GRADE_GUIDE.map((row) => (
              <tr key={row.grade}>
                <td className="tp-num">
                  <b>{row.grade}</b>
                </td>
                <td>{row.meaning}</td>
                <td className="tp-nowrap">{row.counted}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tp-small tp-muted">サーブ効果率 =(エース×100 + 効果×25 − ミス×25)÷ 打数</p>
      </div>
    </details>
  );
}
