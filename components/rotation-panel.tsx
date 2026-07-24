"use client";

import { useEffect, useMemo, useState } from "react";
import { getEffectGrade, getSkillLabel, getTeamLabel } from "@/lib/domain/display";
import { getRotationLabel, getSideLabel } from "@/lib/domain/rotation";
import type { ParsedEvent, ParsedMatch, TeamSide } from "@/lib/domain/types";

type RotationPanelProps = {
  match?: ParsedMatch;
  selectedPlayId?: string;
  selectedRotation: string;
  onSelectedRotationChange: (rotation: string) => void;
};

type RotationFocus = {
  setIndex: number;
  event: ParsedEvent;
};

type RotationRateRow = {
  rotationLabel: string;
  attempts: number;
  wins: number;
  sideoutAttempts: number;
  sideoutWins: number;
  breakAttempts: number;
  breakWins: number;
};

const COURT_LAYOUT = [
  ["4", "3", "2"],
  ["5", "6", "1"],
];

function formatRate(wins: number, attempts: number): string {
  if (attempts === 0) {
    return "-";
  }

  return `${((wins / attempts) * 100).toFixed(1)}%`;
}

function formatMadeCount(wins: number, attempts: number): string {
  if (attempts === 0) {
    return "-";
  }

  return `${attempts}本中${wins}本`;
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

function getFirstPlayForSide(event: ParsedEvent, side: TeamSide) {
  const teamCode = side === "home" ? "*" : "a";
  return event.plays.find((play) => play.team === teamCode);
}

function buildRotationRows(match: ParsedMatch, side: TeamSide): RotationRateRow[] {
  const rows = new Map<string, RotationRateRow>();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const rotationLabel = getRotationLabel(event.lineup[side]);
      const current = rows.get(rotationLabel) ?? {
        rotationLabel,
        attempts: 0,
        wins: 0,
        sideoutAttempts: 0,
        sideoutWins: 0,
        breakAttempts: 0,
        breakWins: 0,
      };

      current.attempts += 1;
      if (getWinningSide(event) === side) {
        current.wins += 1;
      }

      const firstPlay = getFirstPlayForSide(event, side);
      if (firstPlay?.skill === "R") {
        current.sideoutAttempts += 1;
        if (getWinningSide(event) === side) {
          current.sideoutWins += 1;
        }
      }
      if (firstPlay?.skill === "S") {
        current.breakAttempts += 1;
        if (getWinningSide(event) === side) {
          current.breakWins += 1;
        }
      }

      rows.set(rotationLabel, current);
    });
  });

  return [...rows.values()].sort((a, b) =>
    a.rotationLabel.localeCompare(b.rotationLabel, "ja"),
  );
}

function getScoreBeforeRally(score: { home: number; away: number }, point?: string) {
  if (point === "*") {
    return { home: Math.max(0, score.home - 1), away: score.away };
  }
  if (point === "a") {
    return { home: score.home, away: Math.max(0, score.away - 1) };
  }
  return score;
}

function getRallyNumber(event: ParsedEvent) {
  const score = getScoreBeforeRally(event.score, event.point);
  return score.home + score.away + 1;
}

function findFocusEvent(
  match: ParsedMatch | undefined,
  selectedPlayId?: string,
): RotationFocus | undefined {
  if (!match) {
    return undefined;
  }

  if (selectedPlayId) {
    for (const set of match.sets) {
      for (const event of set.events) {
        if (event.plays.some((play) => play.id === selectedPlayId)) {
          return { setIndex: set.setIndex, event };
        }
      }
    }
  }

  const firstSet = match.sets[0];
  const firstEvent = firstSet?.events[0];
  if (!firstSet || !firstEvent) {
    return undefined;
  }

  return { setIndex: firstSet.setIndex, event: firstEvent };
}

function RotationCourt({
  side,
  event,
  teamName,
}: {
  side: TeamSide;
  event: ParsedEvent;
  teamName: string;
}) {
  const lineup = event.lineup[side];

  return (
    <div className="rotation-team-card">
      <div className="rotation-team-header">
        <strong>{teamName}</strong>
        <small className="muted">
          {getSideLabel(side)} / {getRotationLabel(lineup)}
        </small>
      </div>
      <div className="court-grid" aria-label={`${teamName} rotation`}>
        {COURT_LAYOUT.flatMap((row) =>
          row.map((positionKey) => {
            const value = lineup.positions[positionKey] ?? "-";
            const isSetter = Number(positionKey) === lineup.setterAt;
            return (
              <div
                className={`court-cell${isSetter ? " court-cell-setter" : ""}`}
                key={`${side}-${positionKey}`}
              >
                <small>位置{positionKey}</small>
                <strong>{String(value)}</strong>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

export function RotationPanel({
  match,
  selectedPlayId,
  selectedRotation,
  onSelectedRotationChange,
}: RotationPanelProps) {
  const focus = findFocusEvent(match, selectedPlayId);
  const initialSetIndex = focus?.setIndex ?? match?.sets[0]?.setIndex ?? 1;
  const [selectedSetIndex, setSelectedSetIndex] = useState(initialSetIndex);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(focus?.event.id);
  const [activeSide, setActiveSide] = useState<TeamSide>("home");

  useEffect(() => {
    setSelectedSetIndex(initialSetIndex);
    setSelectedEventId(focus?.event.id);
  }, [focus?.event.id, initialSetIndex]);

  const selectedSet = useMemo(
    () => match?.sets.find((set) => set.setIndex === selectedSetIndex) ?? match?.sets[0],
    [match, selectedSetIndex],
  );

  const rotationOptions = useMemo(() => {
    const values = new Set<string>();
    selectedSet?.events.forEach((event) => {
      const label = getRotationLabel(event.lineup.home);
      if (label !== "-") {
        values.add(label);
      }
    });
    return [...values].sort((a, b) => a.localeCompare(b, "ja"));
  }, [selectedSet]);

  const filteredEvents = useMemo(() => {
    if (!selectedSet) {
      return [];
    }

    return selectedSet.events.filter((event) =>
      selectedRotation === "all"
        ? true
        : getRotationLabel(event.lineup.home) === selectedRotation,
    );
  }, [selectedRotation, selectedSet]);

  const selectedEvent = useMemo(
    () =>
      filteredEvents.find((event) => event.id === selectedEventId) ??
      filteredEvents[0],
    [filteredEvents, selectedEventId],
  );

  useEffect(() => {
    if (!filteredEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(filteredEvents[0]?.id);
    }
  }, [filteredEvents, selectedEventId]);

  const rotationRows = useMemo(() => (match ? buildRotationRows(match, activeSide) : []), [activeSide, match]);

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>ローテーション</h2>
          <p className="muted">
            セットとラリーを選びながら、その時点のラインナップを確認できます。
          </p>
        </div>

        {!selectedSet || !selectedEvent || !match ? (
          <div className="analysis-block">
            <p className="muted">ローテーションを表示できるイベントがありません。</p>
          </div>
        ) : (
          <>
            <div className="rotation-summary">
              <div className="meta-card">
                <span className="muted">注目位置</span>
                <strong>セット {selectedSet.setIndex}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">スコア</span>
                <strong>
                  {selectedEvent.score.home}-{selectedEvent.score.away}
                </strong>
              </div>
              <div className="meta-card">
                <span className="muted">自チーム</span>
                <strong>{getRotationLabel(selectedEvent.lineup.home)}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">相手チーム</span>
                <strong>{getRotationLabel(selectedEvent.lineup.away)}</strong>
              </div>
            </div>

            <div className="rotation-filter-grid">
              <div className="field">
                <label htmlFor="rotation-set-selector">セット</label>
                <select
                  id="rotation-set-selector"
                  value={selectedSet.setIndex}
                  onChange={(event) => {
                    const nextSetIndex = Number(event.target.value);
                    const nextSet = match.sets.find((set) => set.setIndex === nextSetIndex);
                    setSelectedSetIndex(nextSetIndex);
                    setSelectedEventId(nextSet?.events[0]?.id);
                  }}
                >
                  {match.sets.map((set) => (
                    <option key={set.id} value={set.setIndex}>
                      セット {set.setIndex}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="rotation-filter-selector">自チームローテ</label>
                <select
                  id="rotation-filter-selector"
                  value={selectedRotation}
                  onChange={(event) => onSelectedRotationChange(event.target.value)}
                >
                  <option value="all">すべて</option>
                  {rotationOptions.map((rotation) => (
                    <option key={rotation} value={rotation}>
                      {rotation}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="rotation-event-selector">ラリー</label>
                <select
                  id="rotation-event-selector"
                  value={selectedEvent.id}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                >
                  {filteredEvents.map((event) => (
                    <option key={event.id} value={event.id}>
                      ラリー {getRallyNumber(event)} ({event.score.home}-{event.score.away})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rotation-grid">
              <RotationCourt
                side="home"
                event={selectedEvent}
                teamName={match.teams.home.name}
              />
              <RotationCourt
                side="away"
                event={selectedEvent}
                teamName={match.teams.away.name}
              />
            </div>

            <div className="analysis-block">
              <h3>ローテーション別得点率</h3>
              <div className="tab-row" role="tablist" aria-label="ローテーション分析チーム切替">
                {(["home", "away"] as TeamSide[]).map((side) => (
                  <button
                    key={side}
                    className={`tab-button${activeSide === side ? " tab-button-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activeSide === side}
                    onClick={() => setActiveSide(side)}
                  >
                    {side === "home" ? match.teams.home.name : match.teams.away.name}
                  </button>
                ))}
              </div>
              <div className="score-table-wrap">
                <table className="score-table">
                  <thead>
                    <tr>
                      <th>ローテーション</th>
                      <th>得点</th>
                      <th>ラリー</th>
                      <th>得点率</th>
                      <th>Sideout%</th>
                      <th>Break%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rotationRows.map((row) => (
                      <tr key={row.rotationLabel}>
                        <td>{row.rotationLabel}</td>
                        <td>{row.wins}</td>
                        <td>{row.attempts}</td>
                        <td>{formatMadeCount(row.wins, row.attempts)}</td>
                        <td>{formatRate(row.sideoutWins, row.sideoutAttempts)}</td>
                        <td>{formatRate(row.breakWins, row.breakAttempts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="analysis-block">
              <h3>選択ラリーのプレイ</h3>
              <div className="tag-row">
                {selectedEvent.plays.map((play) => (
                  <span className="tag" key={play.id}>
                    {getTeamLabel(play.team, match)}:{play.player ?? "-"}:
                    {getSkillLabel(play.skill)}:{getEffectGrade(play.effect)}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
