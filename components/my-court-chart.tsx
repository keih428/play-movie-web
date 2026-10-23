import {
  COURT_BOTTOM,
  COURT_LEFT,
  COURT_RIGHT,
  COURT_TOP,
  NET_Y,
  type CourseLine,
} from "@/lib/domain/court";

const COLORS: Record<CourseLine["result"], string> = {
  kill: "#d92d20",
  error: "#8a8f98",
  other: "#1464a5",
};

/**
 * 自分のアタック・サーブの軌道(試合ビューアの「コース」と同じ図。2026-10-24 から)。
 * 決まったものは赤、ミスは灰色の点線、それ以外は青。
 */
export function MyCourtChart({ lines, label }: { lines: CourseLine[]; label: string }) {
  if (lines.length === 0) {
    return <p className="tp-small tp-muted">コースを描けるデータがありません(ゾーンが記録されていません)。</p>;
  }
  return (
    <figure className="tp-mycourt">
      <svg className="course-court" viewBox="0 0 500 780" role="img" aria-label={`${label}のコース`}>
        <defs>
          {(Object.keys(COLORS) as CourseLine["result"][]).map((key) => (
            <marker
              key={key}
              id={`my-course-arrow-${key}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill={COLORS[key]} />
            </marker>
          ))}
        </defs>
        <rect
          className="course-court-surface"
          x={COURT_LEFT}
          y={COURT_TOP}
          width={COURT_RIGHT - COURT_LEFT}
          height={COURT_BOTTOM - COURT_TOP}
        />
        <line className="course-court-line" x1={COURT_LEFT} y1={NET_Y - 120} x2={COURT_RIGHT} y2={NET_Y - 120} />
        <line className="course-court-line" x1={COURT_LEFT} y1={NET_Y + 120} x2={COURT_RIGHT} y2={NET_Y + 120} />
        <line className="course-net" x1={COURT_LEFT - 12} y1={NET_Y} x2={COURT_RIGHT + 12} y2={NET_Y} />
        <text className="course-court-label" x="250" y="20" textAnchor="middle">
          相手
        </text>
        <text className="course-court-label" x="250" y="774" textAnchor="middle">
          自分
        </text>
        {/* 決まったものを一番上に描く */}
        {[...lines]
          .sort((a, b) => (a.result === "kill" ? 1 : 0) - (b.result === "kill" ? 1 : 0))
          .map((line, index) => (
            <g key={index}>
              <line
                className="course-path"
                x1={line.start.x}
                y1={line.start.y}
                x2={line.end.x}
                y2={line.end.y}
                stroke={COLORS[line.result]}
                strokeDasharray={line.result === "error" ? "8 6" : undefined}
                markerEnd={`url(#my-course-arrow-${line.result})`}
              />
              <circle cx={line.start.x} cy={line.start.y} r="4" fill={COLORS[line.result]} />
            </g>
          ))}
      </svg>
      <figcaption className="tp-mycourt-legend">
        <span style={{ color: COLORS.kill }}>━ 決まった</span>
        <span style={{ color: COLORS.other }}>━ つながった</span>
        <span style={{ color: COLORS.error }}>┅ ミス</span>
      </figcaption>
    </figure>
  );
}
