"use client";

import { useState } from "react";
import { getSkillLabel } from "@/lib/domain/display";
import type { ParsedEvent, ParsedMatch, ParsedPlay, TeamSide } from "@/lib/domain/types";

type AnalysisPanelProps = {
  match?: ParsedMatch;
};

type SkillSummaryRow = {
  skill: string;
  count: number;
};

type RotationRow = {
  rotationLabel: string;
  attempts: number;
  wins: number;
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
  const counts = new Map<string, number>();

  plays.forEach((play) => {
    const skill = play.skill ?? "不明";
    counts.set(skill, (counts.get(skill) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}

function buildRotationRows(match: ParsedMatch, side: TeamSide): RotationRow[] {
  const rows = new Map<string, { attempts: number; wins: number }>();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const setterAt = event.lineup[side].setterAt ?? 0;
      const key = `ローテ${setterAt || "-"}`;
      const current = rows.get(key) ?? { attempts: 0, wins: 0 };
      current.attempts += 1;
      if (getWinningSide(event) === side) {
        current.wins += 1;
      }
      rows.set(key, current);
    });
  });

  return [...rows.entries()]
    .map(([rotationLabel, value]) => ({
      rotationLabel,
      attempts: value.attempts,
      wins: value.wins,
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

export function AnalysisPanel({ match }: AnalysisPanelProps) {
  const homeAnalysis = buildTeamAnalysis(match, "home");
  const awayAnalysis = buildTeamAnalysis(match, "away");
  const [activeSide, setActiveSide] = useState<TeamSide>("home");

  const activeAnalysis =
    activeSide === "home" ? homeAnalysis ?? awayAnalysis : awayAnalysis ?? homeAnalysis;
  const maxSkillCount = activeAnalysis?.skillSummary[0]?.count ?? 1;

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>分析</h2>
          <p className="muted">
            チーム別に、スキル内訳、ローテーション別得点率、Sideout% / Break%、
            個人成績を表示します。
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

            <div className="analysis-grid">
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
                <h3>ローテーション別得点率</h3>
                <div className="score-table-wrap">
                  <table className="score-table">
                    <thead>
                      <tr>
                        <th>ローテーション</th>
                        <th>得点</th>
                        <th>ラリー</th>
                        <th>得点率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAnalysis.rotations.map((row) => (
                        <tr key={row.rotationLabel}>
                          <td>{row.rotationLabel}</td>
                          <td>{row.wins}</td>
                          <td>{row.attempts}</td>
                          <td>{formatRate(row.wins, row.attempts)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="analysis-block">
              <h3>個人成績</h3>
              <div className="score-table-wrap">
                <table className="score-table">
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
