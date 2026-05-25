import { getSkillLabel } from "@/lib/domain/display";
import type { ParsedMatch } from "@/lib/domain/types";

type AnalysisPanelProps = {
  match?: ParsedMatch;
};

type SkillSummaryRow = {
  skill: string;
  count: number;
};

type TimelinePoint = {
  eventIndex: number;
  home: number;
  away: number;
};

function buildSkillSummary(match: ParsedMatch | undefined): SkillSummaryRow[] {
  if (!match) {
    return [];
  }

  const counts = new Map<string, number>();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      event.plays.forEach((play) => {
        const skill = play.skill ?? "不明";
        counts.set(skill, (counts.get(skill) ?? 0) + 1);
      });
    });
  });

  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}

function buildTimeline(match: ParsedMatch | undefined) {
  if (!match) {
    return [];
  }

  return match.sets.map((set) => ({
    setIndex: set.setIndex,
    points: set.events.map(
      (event): TimelinePoint => ({
        eventIndex: event.eventIndex,
        home: event.score.home,
        away: event.score.away,
      }),
    ),
  }));
}

function buildPolyline(
  points: TimelinePoint[],
  side: "home" | "away",
  maxScore: number,
) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = 100 - ((point[side] ?? 0) / Math.max(1, maxScore)) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}

export function AnalysisPanel({ match }: AnalysisPanelProps) {
  const skillSummary = buildSkillSummary(match);
  const timeline = buildTimeline(match);
  const totalEvents =
    match?.sets.reduce((sum, set) => sum + set.events.length, 0) ?? 0;
  const maxSkillCount = skillSummary[0]?.count ?? 1;

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>分析</h2>
          <p className="muted">
            フィルタ後のプレイデータから、スキル別件数とセットごとの得点推移を表示します。
          </p>
        </div>

        <div className="analysis-grid">
          <div className="analysis-block">
            <h3>スキル内訳</h3>
            {skillSummary.length === 0 ? (
              <p className="muted">表示できるプレイがありません。</p>
            ) : (
              <div className="skill-bars">
                {skillSummary.map((row) => (
                  <div className="skill-bar-row" key={row.skill}>
                    <div className="skill-bar-meta">
                      <strong>{getSkillLabel(row.skill)}</strong>
                      <span className="mono">{row.count}</span>
                    </div>
                    <div className="skill-bar-track">
                      <div
                        className="skill-bar-fill"
                        style={{
                          width: `${(row.count / Math.max(1, maxSkillCount)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="analysis-block">
            <h3>得点推移</h3>
            {timeline.length === 0 ? (
              <p className="muted">セットデータがありません。</p>
            ) : (
              <div className="timeline-stack">
                {timeline.map((set) => {
                  const maxScore = set.points.reduce(
                    (max, point) => Math.max(max, point.home, point.away),
                    0,
                  );
                  const homeLine = buildPolyline(set.points, "home", maxScore);
                  const awayLine = buildPolyline(set.points, "away", maxScore);

                  return (
                    <div className="timeline-card" key={set.setIndex}>
                      <div className="timeline-header">
                        <strong>セット {set.setIndex}</strong>
                        <small className="muted">
                          {set.points.length} ラリー / 最終スコア{" "}
                          {set.points[set.points.length - 1]?.home ?? 0}-
                          {set.points[set.points.length - 1]?.away ?? 0}
                        </small>
                      </div>
                      <svg
                        className="timeline-chart"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-label={`Set ${set.setIndex} score timeline`}
                      >
                        <line x1="0" y1="100" x2="100" y2="100" className="timeline-axis" />
                        <line x1="0" y1="0" x2="0" y2="100" className="timeline-axis" />
                        {homeLine ? (
                          <polyline className="timeline-home" points={homeLine} />
                        ) : null}
                        {awayLine ? (
                          <polyline className="timeline-away" points={awayLine} />
                        ) : null}
                      </svg>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="meta-grid">
          <div className="meta-card">
            <span className="muted">ラリー数</span>
            <strong>{totalEvents}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">スキル種類</span>
            <strong>{skillSummary.length}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
