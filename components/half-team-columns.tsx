"use client";

import { MEMBER_POSITIONS, type MemberPosition } from "@/lib/domain/portal";

export type HalfTeam = "first" | "second";

type HalfPlayer = {
  id: string;
  displayName: string;
  position: MemberPosition | null;
  slot: string | null;
};

type HalfTeamColumnsProps = {
  players: HalfPlayer[];
  // 前半・後半。入っていない人は「出ない」。
  teams: Record<string, HalfTeam>;
  labels: Record<HalfTeam, string>;
  onMove: (id: string, next: HalfTeam | null) => void;
};

const OTHER: Record<HalfTeam, HalfTeam> = { first: "second", second: "first" };

function sortByPosition(players: HalfPlayer[]): HalfPlayer[] {
  const order = (player: HalfPlayer) =>
    player.position ? MEMBER_POSITIONS.indexOf(player.position) : MEMBER_POSITIONS.length;
  return [...players].sort((a, b) => order(a) - order(b));
}

/**
 * 前半・後半を2列に並べて分ける(2026-11-10 から。けーいちの依頼。それまでは1列で ↑↓)。
 * 左が前半、右が後半。← → でもう片方へ、× で「出ない」へ。「出ない人」は下に並べ、押すと前半・後半に入る。
 * サーブ効果率とスパイク練習で使う。
 */
export function HalfTeamColumns({ players, teams, labels, onMove }: HalfTeamColumnsProps) {
  const out = sortByPosition(players.filter((player) => !teams[player.id]));
  return (
    <>
      <div className="tp-half-cols">
        {(["first", "second"] as const).map((team) => {
          const entries = sortByPosition(players.filter((player) => teams[player.id] === team));
          return (
            <div key={team} className="tp-half-col">
              <p className="tp-small tp-muted">
                <b>{labels[team]}</b>・{entries.length}人
              </p>
              {entries.map((player) => (
                <div key={player.id} className="tp-half-item">
                  <span>
                    <b>{player.displayName}</b>
                    <small>
                      {player.position} ・ {player.slot ?? "枠なし"}
                    </small>
                  </span>
                  <span className="tp-half-buttons">
                    <button
                      type="button"
                      aria-label={`${player.displayName} を${labels[OTHER[team]]}へ`}
                      onClick={() => onMove(player.id, OTHER[team])}
                    >
                      {team === "first" ? "→" : "←"}
                    </button>
                    <button
                      type="button"
                      aria-label={`${player.displayName} を出ない人へ`}
                      onClick={() => onMove(player.id, null)}
                    >
                      ×
                    </button>
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {out.length > 0 ? (
        <div className="tp-counter-picker-section">
          <p className="tp-small tp-muted">出ない人・{out.length}人(押すと入る)</p>
          <div className="tp-half-out">
            {out.map((player) => (
              <div key={player.id} className="tp-half-item">
                <span>
                  <b>{player.displayName}</b>
                  <small>
                    {player.position} ・ {player.slot ?? "枠なし"}
                  </small>
                </span>
                <span className="tp-half-buttons">
                  {(["first", "second"] as const).map((team) => (
                    <button key={team} type="button" onClick={() => onMove(player.id, team)}>
                      {labels[team]}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
