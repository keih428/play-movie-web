"use client";

import { useState } from "react";
import { getEffectGrade, getSkillLabel } from "@/lib/domain/display";
import type { ParsedEvent, ParsedMatch, ParsedPlay, TeamSide } from "@/lib/domain/types";

type AnalysisPanelProps = {
  match?: ParsedMatch;
};

type SkillSummaryRow = {
  skill: string;
  count: number;
  gradeCounts: Record<string, number>;
};

type RotationRow = {
  rotationLabel: string;
  attempts: number;
  wins: number;
  sideoutAttempts: number;
  sideoutWins: number;
  breakAttempts: number;
  breakWins: number;
};

type PlayerRow = {
  player: string;
  total: number;
  serve: number;
  receive: number;
  attack: number;
  block: number;
  directPoints: number;
  errors: number;
};

type TeamAnalysis = {
  side: TeamSide;
  name: string;
  rallyCount: number;
  wonRallies: number;
  sideoutAttempts: number;
  sideoutWins: number;
  breakAttempts: number;
  breakWins: number;
  skillSummary: SkillSummaryRow[];
  rotations: RotationRow[];
  players: PlayerRow[];
};

type ScoreTimelinePoint = {
  rallyIndex: number;
  home: number;
  away: number;
};

function getTeamCode(side: TeamSide) {
  return side === "home" ? "*" : "a";
}

function getWinningSide(event: ParsedEvent): TeamSide | undefined {
  if (event.point === "*") {
    return "home";
  }
  if (event.point === "a") {
    return "away";
  }
  return undefined;
}

function getFirstPlayForSide(event: ParsedEvent, side: TeamSide): ParsedPlay | undefined {
  const teamCode = getTeamCode(side);
  return event.plays.find((play) => play.team === teamCode);
}

function buildSkillSummary(plays: ParsedPlay[]): SkillSummaryRow[] {
  const counts = new Map<string, SkillSummaryRow>();

  plays.forEach((play) => {
    const skill = play.skill ?? "不明";
    const grade = getEffectGrade(play.effect);
    const current =
      counts.get(skill) ??
      {
        skill,
        count: 0,
        gradeCounts: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
      };

    current.count += 1;
    if (current.gradeCounts[grade] !== undefined) {
      current.gradeCounts[grade] += 1;
    }
    counts.set(skill, current);
  });

  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function buildRotationRows(match: ParsedMatch, side: TeamSide): RotationRow[] {
  const rows = new Map<
    string,
    {
      attempts: number;
      wins: number;
      sideoutAttempts: number;
      sideoutWins: number;
      breakAttempts: number;
      breakWins: number;
    }
  >();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const setterAt = event.lineup[side].setterAt ?? 0;
      const key = `ローテ${setterAt || "-"}`;
      const current = rows.get(key) ?? {
        attempts: 0,
        wins: 0,
        sideoutAttempts: 0,
        sideoutWins: 0,
        breakAttempts: 0,
        breakWins: 0,
      };
      current.attempts += 1;
      const winningSide = getWinningSide(event);
      if (winningSide === side) {
        current.wins += 1;
      }
      const firstPlay = getFirstPlayForSide(event, side);
      if (firstPlay?.skill === "R") {
        current.sideoutAttempts += 1;
        if (winningSide === side) {
          current.sideoutWins += 1;
        }
      }
      if (firstPlay?.skill === "S") {
        current.breakAttempts += 1;
        if (winningSide === side) {
          current.breakWins += 1;
        }
      }
      rows.set(key, current);
    });
  });

  return [...rows.entries()]
    .map(([rotationLabel, value]) => ({
      rotationLabel,
      attempts: value.attempts,
      wins: value.wins,
      sideoutAttempts: value.sideoutAttempts,
      sideoutWins: value.sideoutWins,
      breakAttempts: value.breakAttempts,
      breakWins: value.breakWins,
    }))
    .sort((a, b) => a.rotationLabel.localeCompare(b.rotationLabel, "ja"));
}

function buildPlayerRows(plays: ParsedPlay[]): PlayerRow[] {
  const rows = new Map<string, PlayerRow>();

  plays.forEach((play) => {
    const key = play.player ?? "不明";
    const current =
      rows.get(key) ??
      {
        player: key,
        total: 0,
        serve: 0,
        receive: 0,
        attack: 0,
        block: 0,
        directPoints: 0,
        errors: 0,
      };

    current.total += 1;
    if (play.skill === "S") {
      current.serve += 1;
    }
    if (play.skill === "R") {
      current.receive += 1;
    }
    if (play.skill === "A") {
      current.attack += 1;
    }
    if (play.skill === "B") {
      current.block += 1;
    }
    if (play.effect === "#") {
      current.directPoints += 1;
    }
    if (play.effect === "=") {
      current.errors += 1;
    }

    rows.set(key, current);
  });

  return [...rows.values()].sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.player.localeCompare(b.player, "ja");
  });
}

function buildTeamAnalysis(
  match: ParsedMatch | undefined,
  side: TeamSide,
): TeamAnalysis | undefined {
  if (!match) {
    return undefined;
  }

  const teamCode = getTeamCode(side);
  const teamPlays: ParsedPlay[] = [];
  let rallyCount = 0;
  let wonRallies = 0;
  let sideoutAttempts = 0;
  let sideoutWins = 0;
  let breakAttempts = 0;
  let breakWins = 0;

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const eventTeamPlays = event.plays.filter((play) => play.team === teamCode);
      teamPlays.push(...eventTeamPlays);

      if (event.plays.length === 0) {
        return;
      }

      rallyCount += 1;
      const winningSide = getWinningSide(event);
      if (winningSide === side) {
        wonRallies += 1;
      }

      const firstPlay = getFirstPlayForSide(event, side);
      if (firstPlay?.skill === "R") {
        sideoutAttempts += 1;
        if (winningSide === side) {
          sideoutWins += 1;
        }
      }
      if (firstPlay?.skill === "S") {
        breakAttempts += 1;
        if (winningSide === side) {
          breakWins += 1;
        }
      }
    });
  });

  return {
    side,
    name: side === "home" ? match.teams.home.name : match.teams.away.name,
    rallyCount,
    wonRallies,
    sideoutAttempts,
    sideoutWins,
    breakAttempts,
    breakWins,
    skillSummary: buildSkillSummary(teamPlays),
    rotations: buildRotationRows(match, side),
    players: buildPlayerRows(teamPlays),
  };
}

function formatRate(wins: number, attempts: number): string {
  if (attempts === 0) {
    return "-";
  }

  return `${((wins / attempts) * 100).toFixed(1)}%`;
}

function buildTimelinePath(
  points: Array<{ x: number; y: number }>,
): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildScoreTimeline(match: ParsedMatch | undefined) {
  if (!match) {
    return [];
  }

  return match.sets.map((set) => ({
    setId: set.id,
    setIndex: set.setIndex,
    finalScore: set.score,
    points: [
      { rallyIndex: 0, home: 0, away: 0 },
      ...set.events.map<ScoreTimelinePoint>((event) => ({
        rallyIndex: event.eventIndex,
        home: event.score.home,
        away: event.score.away,
      })),
    ],
  }));
}

export function AnalysisPanel({ match }: AnalysisPanelProps) {
  const homeAnalysis = buildTeamAnalysis(match, "home");
  const awayAnalysis = buildTeamAnalysis(match, "away");
  const [activeSide, setActiveSide] = useState<TeamSide>("home");
  const scoreTimeline = buildScoreTimeline(match);

  const activeAnalysis =
    activeSide === "home" ? homeAnalysis ?? awayAnalysis : awayAnalysis ?? homeAnalysis;
  const gradeOrder = ["A", "B", "C", "D", "E", "F"];

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>分析</h2>
          <p className="muted">
            チーム別に、スキル内訳、Sideout% / Break%、個人成績を表示します。
          </p>
        </div>

        {!activeAnalysis || !homeAnalysis || !awayAnalysis ? (
          <div className="analysis-block">
            <p className="muted">分析に必要な試合データがありません。</p>
          </div>
        ) : (
          <>
            <div className="tab-row" role="tablist" aria-label="分析チーム切替">
              {[homeAnalysis, awayAnalysis].map((analysis) => (
                <button
                  key={analysis.side}
                  className={`tab-button${activeSide === analysis.side ? " tab-button-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={activeSide === analysis.side}
                  onClick={() => setActiveSide(analysis.side)}
                >
                  {analysis.name}
                </button>
              ))}
            </div>

            <div className="meta-grid">
              <div className="meta-card">
                <span className="muted">総得点率</span>
                <strong>{formatRate(activeAnalysis.wonRallies, activeAnalysis.rallyCount)}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">Sideout%</span>
                <strong>
                  {formatRate(activeAnalysis.sideoutWins, activeAnalysis.sideoutAttempts)}
                </strong>
              </div>
              <div className="meta-card">
                <span className="muted">Break%</span>
                <strong>
                  {formatRate(activeAnalysis.breakWins, activeAnalysis.breakAttempts)}
                </strong>
              </div>
              <div className="meta-card">
                <span className="muted">ラリー数</span>
                <strong>{activeAnalysis.rallyCount}</strong>
              </div>
            </div>

            <div className="analysis-block">
              <h3>スコア推移</h3>
              {scoreTimeline.length === 0 ? (
                <p className="muted">スコア推移を表示できるラリーがありません。</p>
              ) : (
                <div className="timeline-stack">
                  {scoreTimeline.map((setTimeline) => {
                    const width = 300;
                    const height = 152;
                    const padding = { top: 10, right: 12, bottom: 16, left: 12 };
                    const chartWidth = width - padding.left - padding.right;
                    const chartHeight = height - padding.top - padding.bottom;
                    const maxRally = Math.max(
                      1,
                      setTimeline.points[setTimeline.points.length - 1]?.rallyIndex ?? 1,
                    );
                    const maxScore = Math.max(
                      1,
                      ...setTimeline.points.map((point) => Math.max(point.home, point.away)),
                    );
                    const toX = (value: number) =>
                      padding.left + (value / maxRally) * chartWidth;
                    const toY = (value: number) =>
                      padding.top + chartHeight - (value / maxScore) * chartHeight;
                    const homePath = buildTimelinePath(
                      setTimeline.points.map((point) => ({
                        x: toX(point.rallyIndex),
                        y: toY(point.home),
                      })),
                    );
                    const awayPath = buildTimelinePath(
                      setTimeline.points.map((point) => ({
                        x: toX(point.rallyIndex),
                        y: toY(point.away),
                      })),
                    );

                    return (
                      <div className="timeline-card" key={setTimeline.setId}>
                        <div className="timeline-header">
                          <strong>セット {setTimeline.setIndex}</strong>
                          <small className="muted">
                            {match?.teams.home.name} {setTimeline.finalScore.home} - {setTimeline.finalScore.away} {match?.teams.away.name}
                          </small>
                        </div>
                        <svg
                          className="timeline-chart"
                          viewBox={`0 0 ${width} ${height}`}
                          role="img"
                          aria-label={`セット ${setTimeline.setIndex} のスコア推移`}
                        >
                          <line
                            className="timeline-axis"
                            x1={padding.left}
                            y1={padding.top + chartHeight}
                            x2={width - padding.right}
                            y2={padding.top + chartHeight}
                          />
                          <line
                            className="timeline-axis"
                            x1={padding.left}
                            y1={padding.top}
                            x2={padding.left}
                            y2={padding.top + chartHeight}
                          />
                          <path className="timeline-home" d={homePath} />
                          <path className="timeline-away" d={awayPath} />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="analysis-block">
              <h3>スキル内訳</h3>
              {activeAnalysis.skillSummary.length === 0 ? (
                <p className="muted">表示できるプレイがありません。</p>
              ) : (
                <div className="skill-bars">
                  {activeAnalysis.skillSummary.map((row) => (
                    <div className="skill-bar-row" key={row.skill}>
                      <div className="skill-bar-meta">
                        <strong>{getSkillLabel(row.skill)}</strong>
                        <span className="mono">{row.count}</span>
                      </div>
                      <div className="skill-bar-track skill-bar-track-stacked">
                        {gradeOrder.map((grade) => {
                          const count = row.gradeCounts[grade] ?? 0;
                          return count > 0 ? (
                            <div
                              className={`skill-bar-segment skill-bar-grade-${grade}`}
                              key={grade}
                              style={{
                                width: `${(count / Math.max(1, row.count)) * 100}%`,
                              }}
                              title={`${grade}: ${count}`}
                            />
                          ) : null;
                        })}
                      </div>
                      <div className="tag-row">
                        {gradeOrder.map((grade) => (
                          <span className={`tag skill-grade-tag skill-grade-tag-${grade}`} key={grade}>
                            {grade} {row.gradeCounts[grade] ?? 0}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="analysis-block">
              <h3>個人成績</h3>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>背番号</th>
                      <th>総プレイ</th>
                      <th>サーブ</th>
                      <th>レセプション</th>
                      <th>アタック</th>
                      <th>ブロック</th>
                      <th>直接得点</th>
                      <th>ミス</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeAnalysis.players.map((row) => (
                      <tr key={row.player}>
                        <td>{row.player}</td>
                        <td>{row.total}</td>
                        <td>{row.serve}</td>
                        <td>{row.receive}</td>
                        <td>{row.attack}</td>
                        <td>{row.block}</td>
                        <td>{row.directPoints}</td>
                        <td>{row.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
