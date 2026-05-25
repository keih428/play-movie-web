import { getEffectGrade, getSkillLabel, getTeamLabel } from "@/lib/domain/display";
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

function countRotationChanges(
  match: ParsedMatch | undefined,
  side: TeamSide,
): number {
  if (!match) {
    return 0;
  }

  let changes = 0;
  let previousSignature: string | undefined;

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const positions = event.lineup[side].positions;
      const signature = ["1", "2", "3", "4", "5", "6"]
        .map((key) => positions[key] ?? "-")
        .join("|");

      if (previousSignature && previousSignature !== signature) {
        changes += 1;
      }
      previousSignature = signature;
    });
  });

  return changes;
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
        <small className="muted">セッター位置: {lineup.setterAt ?? "-"}</small>
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
  const homeChanges = countRotationChanges(match, "home");
  const awayChanges = countRotationChanges(match, "away");

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>ローテーション</h2>
          <p className="muted">
            選択中プレイが属するイベントのラインナップを表示します。未選択時は最初のイベントを基準にします。
          </p>
        </div>

        {!focus || !match ? (
          <div className="analysis-block">
            <p className="muted">ローテーションを表示できるイベントがありません。</p>
          </div>
        ) : (
          <>
            <div className="rotation-summary">
              <div className="meta-card">
                <span className="muted">注目位置</span>
                <strong>
                  セット {focus.setIndex} / ラリー {focus.event.eventIndex}
                </strong>
              </div>
              <div className="meta-card">
                <span className="muted">スコア</span>
                <strong>
                  {focus.event.score.home}-{focus.event.score.away}
                </strong>
              </div>
              <div className="meta-card">
                <span className="muted">ホーム変化回数</span>
                <strong>{homeChanges}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">アウェイ変化回数</span>
                <strong>{awayChanges}</strong>
              </div>
            </div>

            <div className="rotation-grid">
              <RotationCourt
                side="home"
                event={focus.event}
                teamName={match.teams.home.name}
              />
              <RotationCourt
                side="away"
                event={focus.event}
                teamName={match.teams.away.name}
              />
            </div>

            <div className="analysis-block">
              <h3>注目ラリーのプレイ</h3>
              <div className="tag-row">
                {focus.event.plays.map((play) => (
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
