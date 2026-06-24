"use client";

import { useEffect, useMemo, useState } from "react";
import { getTeamLabel } from "@/lib/domain/display";
import type { ParsedMatch, ParsedPlay } from "@/lib/domain/types";

type CoursePanelProps = {
  match?: ParsedMatch;
  ownTeamName?: string;
};

type CourseSkill = "S" | "A";

type Point = {
  x: number;
  y: number;
};

type CoursePlay = {
  play: ParsedPlay;
  player: string;
  start: Point;
  end: Point;
};

const COURT_LEFT = 70;
const COURT_RIGHT = 430;
const COURT_TOP = 30;
const COURT_BOTTOM = 750;
const NET_Y = 390;
const HALF_COURT_HEIGHT = 360;
const PLAYER_COLORS = [
  "#1464a5",
  "#c2412d",
  "#17804b",
  "#7656a5",
  "#c07800",
  "#00838f",
  "#ad3974",
  "#5f6b16",
];

const ZONE_GRID: Record<number, { column: number; row: number }> = {
  4: { column: 0, row: 0 },
  3: { column: 1, row: 0 },
  2: { column: 2, row: 0 },
  7: { column: 0, row: 1 },
  8: { column: 1, row: 1 },
  9: { column: 2, row: 1 },
  5: { column: 0, row: 2 },
  6: { column: 1, row: 2 },
  1: { column: 2, row: 2 },
};

const SERVE_START_ZONES = [5, 7, 6, 9, 1];

function getDefaultTeamCode(match: ParsedMatch | undefined, ownTeamName?: string) {
  if (ownTeamName && match?.teams.away.name === ownTeamName) {
    return "a";
  }

  return "*";
}

function getZonePoint(zone: number, courtSide: "near" | "far"): Point | undefined {
  const grid = ZONE_GRID[zone];
  if (!grid) {
    return undefined;
  }

  const cellWidth = (COURT_RIGHT - COURT_LEFT) / 3;
  const cellHeight = HALF_COURT_HEIGHT / 3;
  const localX = COURT_LEFT + cellWidth * (grid.column + 0.5);
  const localY = cellHeight * (grid.row + 0.5);

  if (courtSide === "near") {
    return {
      x: localX,
      y: NET_Y + localY,
    };
  }

  return {
    x: COURT_LEFT + COURT_RIGHT - localX,
    y: NET_Y - localY,
  };
}

function getEndZonePoint(zone: number, subZone?: string): Point | undefined {
  const grid = ZONE_GRID[zone];
  if (!grid) {
    return undefined;
  }

  const cellWidth = (COURT_RIGHT - COURT_LEFT) / 3;
  const cellHeight = HALF_COURT_HEIGHT / 3;
  const cellLeft = COURT_LEFT + cellWidth * grid.column;
  const cellTop = NET_Y - cellHeight * (grid.row + 1);
  const normalizedSubZone = subZone?.trim().toUpperCase();
  const subZonePosition: Record<string, Point> = {
    A: { x: 0.75, y: 0.25 },
    D: { x: 0.25, y: 0.25 },
    B: { x: 0.75, y: 0.75 },
    C: { x: 0.25, y: 0.75 },
  };
  const position = normalizedSubZone
    ? subZonePosition[normalizedSubZone]
    : undefined;

  return {
    x: cellLeft + cellWidth * (position?.x ?? 0.5),
    y: cellTop + cellHeight * (position?.y ?? 0.5),
  };
}

function getServeStartPoint(zone: number): Point | undefined {
  const positionIndex = SERVE_START_ZONES.indexOf(zone);
  if (positionIndex === -1) {
    return undefined;
  }

  const courtWidth = COURT_RIGHT - COURT_LEFT;
  return {
    x: COURT_LEFT + courtWidth * ((positionIndex + 0.5) / SERVE_START_ZONES.length),
    y: COURT_BOTTOM,
  };
}

function getAttackStartPoint(play: ParsedPlay): Point | undefined {
  const hitType = play.hitType?.trim().toUpperCase();
  const courtWidth = COURT_RIGHT - COURT_LEFT;
  const backAttackPosition = hitType?.replace(/^P/, "");

  if (
    backAttackPosition === "7" ||
    backAttackPosition === "8" ||
    backAttackPosition === "9"
  ) {
    const column = Number(backAttackPosition) - 7;
    return {
      x: COURT_LEFT + courtWidth * ((column + 0.5) / 3),
      y: NET_Y + 120,
    };
  }

  if (hitType === "P1" || hitType === "PV") {
    return {
      x: COURT_LEFT + courtWidth / 18,
      y: NET_Y,
    };
  }

  if (hitType === "P5" || hitType === "PZ") {
    return {
      x: COURT_RIGHT - courtWidth / 18,
      y: NET_Y,
    };
  }

  if (typeof play.startZone !== "number") {
    return {
      x: COURT_LEFT + courtWidth / 2,
      y: NET_Y,
    };
  }

  const zonePoint = getZonePoint(play.startZone, "near");
  return zonePoint
    ? {
        x: zonePoint.x,
        y: NET_Y,
      }
    : {
        x: COURT_LEFT + courtWidth / 2,
        y: NET_Y,
      };
}

function getPlayerLabel(play: ParsedPlay) {
  return play.player?.trim() || "不明な選手";
}

export function CoursePanel({ match, ownTeamName }: CoursePanelProps) {
  const defaultTeamCode = getDefaultTeamCode(match, ownTeamName);
  const [teamCode, setTeamCode] = useState(defaultTeamCode);
  const [player, setPlayer] = useState("all");
  const [skill, setSkill] = useState<CourseSkill>("S");

  useEffect(() => {
    setTeamCode(defaultTeamCode);
    setPlayer("all");
    setSkill("S");
  }, [defaultTeamCode, match?.id]);

  const plays = useMemo(
    () =>
      match?.sets.flatMap((set) =>
        set.events.flatMap((event) => event.plays),
      ) ?? [],
    [match],
  );

  const players = useMemo(
    () =>
      [
        ...new Set(
          plays
            .filter((play) => play.team === teamCode && play.skill === skill)
            .map(getPlayerLabel),
        ),
      ].sort(),
    [plays, skill, teamCode],
  );

  useEffect(() => {
    if (player !== "all" && !players.includes(player)) {
      setPlayer("all");
    }
  }, [player, players]);

  const matchingPlays = plays.filter(
    (play) =>
      play.team === teamCode &&
      play.skill === skill &&
      (player === "all" || getPlayerLabel(play) === player),
  );

  const coursePlays = matchingPlays
    .map<CoursePlay | undefined>((play) => {
      if (typeof play.endZone !== "number") {
        return undefined;
      }

      const start =
        skill === "S"
          ? typeof play.startZone === "number"
            ? getServeStartPoint(play.startZone)
            : undefined
          : getAttackStartPoint(play);
      const end = getEndZonePoint(play.endZone, play.endSubZone);
      if (!start || !end) {
        return undefined;
      }

      return {
        play,
        player: getPlayerLabel(play),
        start,
        end,
      };
    })
    .filter((entry): entry is CoursePlay => Boolean(entry));

  const visiblePlayers = [...new Set(coursePlays.map((entry) => entry.player))];
  const playerColorMap = new Map(
    visiblePlayers.map((name, index) => [
      name,
      PLAYER_COLORS[index % PLAYER_COLORS.length],
    ]),
  );
  const omittedCount = matchingPlays.length - coursePlays.length;
  const selectedTeamLabel = getTeamLabel(teamCode, match);
  const opponentLabel =
    teamCode === "*" ? match?.teams.away.name : match?.teams.home.name;

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>コース</h2>
          <p className="muted">選択した選手の試合全体の軌道を重ねて表示します。</p>
        </div>

        <div className="course-filter-grid">
          <div className="field">
            <label htmlFor="course-team-filter">チーム</label>
            <select
              id="course-team-filter"
              value={teamCode}
              onChange={(event) => {
                setTeamCode(event.target.value);
                setPlayer("all");
              }}
            >
              <option value="*">{match?.teams.home.name ?? "自チーム"}</option>
              <option value="a">{match?.teams.away.name ?? "相手チーム"}</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="course-player-filter">選手</label>
            <select
              id="course-player-filter"
              value={player}
              onChange={(event) => setPlayer(event.target.value)}
            >
              <option value="all">すべての選手</option>
              {players.map((playerName) => (
                <option key={playerName} value={playerName}>
                  {playerName}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="course-skill-filter">プレイ</label>
            <select
              id="course-skill-filter"
              value={skill}
              onChange={(event) => {
                setSkill(event.target.value as CourseSkill);
                setPlayer("all");
              }}
            >
              <option value="S">サーブ</option>
              <option value="A">アタック</option>
            </select>
          </div>
        </div>

        <div className="course-summary">
          <strong>{coursePlays.length}本</strong>
          <span className="muted">
            {selectedTeamLabel} / {player === "all" ? "すべての選手" : player} /{" "}
            {skill === "S" ? "サーブ" : "アタック"}
          </span>
          {omittedCount > 0 ? (
            <span className="muted">座標なし {omittedCount}本</span>
          ) : null}
        </div>

        <div className="course-court-wrap">
          <svg
            className="course-court"
            viewBox="0 0 500 780"
            role="img"
            aria-label={`${selectedTeamLabel}の${skill === "S" ? "サーブ" : "アタック"}コース`}
          >
            <defs>
              {visiblePlayers.map((playerName, index) => {
                const color = playerColorMap.get(playerName);
                return (
                  <marker
                    id={`course-arrow-${index}`}
                    key={playerName}
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
                  </marker>
                );
              })}
            </defs>

            <rect
              className="course-court-surface"
              x={COURT_LEFT}
              y={COURT_TOP}
              width={COURT_RIGHT - COURT_LEFT}
              height={COURT_BOTTOM - COURT_TOP}
            />
            <line
              className="course-court-line"
              x1={COURT_LEFT}
              y1={NET_Y - 120}
              x2={COURT_RIGHT}
              y2={NET_Y - 120}
            />
            <line
              className="course-court-line"
              x1={COURT_LEFT}
              y1={NET_Y + 120}
              x2={COURT_RIGHT}
              y2={NET_Y + 120}
            />
            <line
              className="course-net"
              x1={COURT_LEFT - 12}
              y1={NET_Y}
              x2={COURT_RIGHT + 12}
              y2={NET_Y}
            />

            <text className="course-court-label" x="250" y="20" textAnchor="middle">
              {opponentLabel ?? "相手チーム"}
            </text>
            <text className="course-court-label" x="250" y="774" textAnchor="middle">
              {selectedTeamLabel}
            </text>

            {coursePlays.map((entry, index) => {
              const playerIndex = visiblePlayers.indexOf(entry.player);
              const color = playerColorMap.get(entry.player);
              return (
                <g key={`${entry.play.id}-${index}`}>
                  <line
                    className="course-path"
                    x1={entry.start.x}
                    y1={entry.start.y}
                    x2={entry.end.x}
                    y2={entry.end.y}
                    stroke={color}
                    markerEnd={`url(#course-arrow-${playerIndex})`}
                  />
                  <circle
                    className="course-start-point"
                    cx={entry.start.x}
                    cy={entry.start.y}
                    r="4"
                    fill={color}
                  />
                </g>
              );
            })}
          </svg>

          {coursePlays.length === 0 ? (
            <div className="course-empty">
              <strong>表示できる軌道がありません</strong>
              <span className="muted">選択条件またはゾーンデータを確認してください。</span>
            </div>
          ) : null}
        </div>

        {visiblePlayers.length > 0 ? (
          <div className="course-legend" aria-label="選手別の軌道色">
            {visiblePlayers.map((playerName) => (
              <span className="course-legend-item" key={playerName}>
                <span
                  className="course-legend-color"
                  style={{ backgroundColor: playerColorMap.get(playerName) }}
                />
                {playerName}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
