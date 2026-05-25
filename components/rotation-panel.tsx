"use client";

import { useEffect, useMemo, useState } from "react";
import { getEffectGrade, getSkillLabel, getTeamLabel } from "@/lib/domain/display";
import { getRotationLabel, getSideLabel } from "@/lib/domain/rotation";
import type { ParsedEvent, ParsedMatch, TeamSide } from "@/lib/domain/types";

type RotationPanelProps = {
  match?: ParsedMatch;
  selectedPlayId?: string;
};

type RotationFocus = {
  setIndex: number;
  event: ParsedEvent;
};

const COURT_LAYOUT = [
  ["4", "3", "2"],
  ["5", "6", "1"],
];

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

export function RotationPanel({ match, selectedPlayId }: RotationPanelProps) {
  const focus = findFocusEvent(match, selectedPlayId);
  const initialSetIndex = focus?.setIndex ?? match?.sets[0]?.setIndex ?? 1;
  const [selectedSetIndex, setSelectedSetIndex] = useState(initialSetIndex);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(focus?.event.id);

  useEffect(() => {
    setSelectedSetIndex(initialSetIndex);
    setSelectedEventId(focus?.event.id);
  }, [focus?.event.id, initialSetIndex]);

  const selectedSet = useMemo(
    () => match?.sets.find((set) => set.setIndex === selectedSetIndex) ?? match?.sets[0],
    [match, selectedSetIndex],
  );

  const selectedEvent = useMemo(
    () =>
      selectedSet?.events.find((event) => event.id === selectedEventId) ??
      selectedSet?.events[0],
    [selectedEventId, selectedSet],
  );

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

            <div className="field-grid">
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
                <label htmlFor="rotation-event-selector">ラリー</label>
                <select
                  id="rotation-event-selector"
                  value={selectedEvent.id}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                >
                  {selectedSet.events.map((event) => (
                    <option key={event.id} value={event.id}>
                      ラリー {event.eventIndex} ({event.score.home}-{event.score.away})
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
