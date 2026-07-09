"use client";

import { useState } from "react";
import { getEffectGrade, getSkillLabel } from "@/lib/domain/display";
import type { ParsedEvent, ParsedMatch, ParsedPlay, ParsedSet, TeamSide } from "@/lib/domain/types";

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

type SetOutcomeComparison = {
  won: TeamAnalysis;
  lost: TeamAnalysis;
  wonSetLabels: string;
  lostSetLabels: string;
};

type AttackMetricRow = {
  label: string;
  attempts: number;
  kills: number;
  errors: number;
};

type ServeMetricRow = {
  label: string;
  attempts: number;
  noTouchAces: number;
  serviceAces: number;
  effective: number;
  misses: number;
};

type ReceptionMetricRow = {
  label: string;
  attempts: number;
  ab: number;
  errors: number;
};

type DistributionRow = {
  label: string;
  count: number;
  total: number;
};

type BlockSetRow = {
  setIndex: number;
  successes: number;
  misses: number;
};

type Point = {
  x: number;
  y: number;
};

type AttackCourseSummary = {
  attempts: number;
  kills: number;
};

type AttackCourseRow = {
  player: string;
  feint: AttackCourseSummary;
  straight: AttackCourseSummary;
  cross: AttackCourseSummary;
};

type ServeBreakRow = {
  player: string;
  attempts: number;
  breaks: number;
  nonMissAttempts: number;
  nonMissBreaks: number;
};

type AnalysisCategory =
  | "overview"
  | "attack"
  | "serve"
  | "reception"
  | "block"
  | "player";

const ANALYSIS_CATEGORIES: Array<{ key: AnalysisCategory; label: string }> = [
  { key: "overview", label: "概要" },
  { key: "attack", label: "攻撃" },
  { key: "serve", label: "サーブ" },
  { key: "reception", label: "レセプション" },
  { key: "block", label: "ブロック" },
  { key: "player", label: "個人" },
];

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

function buildRotationRows(sets: ParsedSet[], side: TeamSide): RotationRow[] {
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

  sets.forEach((set) => {
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

  return [...rows.values()].sort((a, b) =>
    a.player.localeCompare(b.player, "ja", { numeric: true }),
  );
}

function buildTeamAnalysis(
  match: ParsedMatch | undefined,
  side: TeamSide,
  sets: ParsedSet[] | undefined = match?.sets,
): TeamAnalysis | undefined {
  if (!match || !sets) {
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

  sets.forEach((set) => {
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
    rotations: buildRotationRows(sets, side),
    players: buildPlayerRows(teamPlays),
  };
}

function getSetWinningSide(set: ParsedSet): TeamSide | undefined {
  if (set.score.home > set.score.away) {
    return "home";
  }
  if (set.score.away > set.score.home) {
    return "away";
  }
  return undefined;
}

function formatSetLabels(sets: ParsedSet[]): string {
  return sets.map((set) => `${set.setIndex}S`).join(", ");
}

function buildSetOutcomeComparison(
  match: ParsedMatch | undefined,
  side: TeamSide,
): SetOutcomeComparison | undefined {
  if (!match) {
    return undefined;
  }

  const wonSets = match.sets.filter((set) => getSetWinningSide(set) === side);
  const lostSets = match.sets.filter((set) => {
    const winningSide = getSetWinningSide(set);
    return winningSide !== undefined && winningSide !== side;
  });

  if (wonSets.length === 0 || lostSets.length === 0) {
    return undefined;
  }

  const won = buildTeamAnalysis(match, side, wonSets);
  const lost = buildTeamAnalysis(match, side, lostSets);
  if (!won || !lost) {
    return undefined;
  }

  return {
    won,
    lost,
    wonSetLabels: formatSetLabels(wonSets),
    lostSetLabels: formatSetLabels(lostSets),
  };
}

function formatRate(wins: number, attempts: number): string {
  if (attempts === 0) {
    return "-";
  }

  return `${((wins / attempts) * 100).toFixed(1)}%`;
}

function formatAttackCourseSummary(summary: AttackCourseSummary): string {
  if (summary.attempts === 0) {
    return "-";
  }

  return `${formatRate(summary.kills, summary.attempts)} (${summary.kills}/${summary.attempts})`;
}

function getRate(wins: number, attempts: number): number | undefined {
  if (attempts === 0) {
    return undefined;
  }

  return (wins / attempts) * 100;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return `${value.toFixed(1)}%`;
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

function getSkillSummaryRow(summary: SkillSummaryRow[], skill: string): SkillSummaryRow {
  return (
    summary.find((row) => row.skill === skill) ?? {
      skill,
      count: 0,
      gradeCounts: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    }
  );
}

function getRotationRow(rows: RotationRow[], rotationLabel: string): RotationRow {
  return (
    rows.find((row) => row.rotationLabel === rotationLabel) ?? {
      rotationLabel,
      attempts: 0,
      wins: 0,
      sideoutAttempts: 0,
      sideoutWins: 0,
      breakAttempts: 0,
      breakWins: 0,
    }
  );
}

function formatSignedRateDiff(leftWins: number, leftAttempts: number, rightWins: number, rightAttempts: number) {
  if (leftAttempts === 0 || rightAttempts === 0) {
    return "-";
  }

  const diff = (leftWins / leftAttempts - rightWins / rightAttempts) * 100;
  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pt`;
}

function getPlayerKey(play: ParsedPlay) {
  return play.player ?? "不明";
}

function isKill(play: ParsedPlay) {
  return play.effect === "#";
}

function isError(play: ParsedPlay) {
  return play.effect === "=";
}

function isReceptionAB(play: ParsedPlay) {
  return play.effect === "#" || play.effect === "+";
}

function isEffectiveServe(play: ParsedPlay) {
  return play.effect === "#" || play.effect === "+" || play.effect === "!";
}

const COURT_LEFT = 70;
const COURT_RIGHT = 430;
const NET_Y = 390;
const HALF_COURT_HEIGHT = 360;
const COURT_WIDTH = COURT_RIGHT - COURT_LEFT;

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

function getZonePoint(zone: number, courtSide: "near" | "far"): Point | undefined {
  const grid = ZONE_GRID[zone];
  if (!grid) {
    return undefined;
  }

  const cellWidth = COURT_WIDTH / 3;
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

function getAttackEndPoint(play: ParsedPlay): Point | undefined {
  if (typeof play.endZone !== "number") {
    return undefined;
  }

  const grid = ZONE_GRID[play.endZone];
  if (!grid) {
    return undefined;
  }

  const cellWidth = COURT_WIDTH / 3;
  const cellHeight = HALF_COURT_HEIGHT / 3;
  const cellLeft = COURT_LEFT + cellWidth * grid.column;
  const cellTop = NET_Y - cellHeight * (grid.row + 1);
  const subZonePosition: Record<string, Point> = {
    A: { x: 0.25, y: 0.75 },
    D: { x: 0.75, y: 0.75 },
    B: { x: 0.25, y: 0.25 },
    C: { x: 0.75, y: 0.25 },
  };
  const position = play.endSubZone
    ? subZonePosition[play.endSubZone.trim().toUpperCase()]
    : undefined;

  return {
    x: cellLeft + cellWidth * (position?.x ?? 0.5),
    y: cellTop + cellHeight * (position?.y ?? 0.5),
  };
}

function getAttackStartPoint(play: ParsedPlay): Point {
  const hitType = play.hitType?.trim().toUpperCase();

  if (
    play.startZone === 7 ||
    play.startZone === 8 ||
    play.startZone === 9
  ) {
    const column = play.startZone - 7;
    return {
      x: COURT_LEFT + COURT_WIDTH * ((column + 0.5) / 3),
      y: NET_Y + 120,
    };
  }

  if (hitType === "P1" || hitType === "PV") {
    return {
      x: COURT_LEFT + COURT_WIDTH / 18,
      y: NET_Y,
    };
  }

  if (hitType === "P5" || hitType === "PZ") {
    return {
      x: COURT_RIGHT - COURT_WIDTH / 18,
      y: NET_Y,
    };
  }

  if (typeof play.startZone !== "number") {
    return {
      x: COURT_LEFT + COURT_WIDTH / 2,
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
        x: COURT_LEFT + COURT_WIDTH / 2,
        y: NET_Y,
      };
}

function getRowsWithTotal<T extends { label: string }>(
  rows: Map<string, T>,
  total: T,
): T[] {
  return [
    total,
    ...[...rows.values()].sort((left, right) =>
      left.label.localeCompare(right.label, "ja", { numeric: true }),
    ),
  ];
}

function buildAttackMetricRows(plays: ParsedPlay[]): AttackMetricRow[] {
  const total: AttackMetricRow = {
    label: "チーム全体",
    attempts: 0,
    kills: 0,
    errors: 0,
  };
  const players = new Map<string, AttackMetricRow>();

  plays.filter((play) => play.skill === "A").forEach((play) => {
    const key = getPlayerKey(play);
    const row =
      players.get(key) ??
      {
        label: key,
        attempts: 0,
        kills: 0,
        errors: 0,
      };

    row.attempts += 1;
    total.attempts += 1;
    if (isKill(play)) {
      row.kills += 1;
      total.kills += 1;
    }
    if (isError(play)) {
      row.errors += 1;
      total.errors += 1;
    }
    players.set(key, row);
  });

  return getRowsWithTotal(players, total);
}

function buildServeMetricRows(plays: ParsedPlay[]): ServeMetricRow[] {
  const total: ServeMetricRow = {
    label: "チーム全体",
    attempts: 0,
    noTouchAces: 0,
    serviceAces: 0,
    effective: 0,
    misses: 0,
  };
  const players = new Map<string, ServeMetricRow>();

  plays.filter((play) => play.skill === "S").forEach((play) => {
    const key = getPlayerKey(play);
    const row =
      players.get(key) ??
      {
        label: key,
        attempts: 0,
        noTouchAces: 0,
        serviceAces: 0,
        effective: 0,
        misses: 0,
      };

    row.attempts += 1;
    total.attempts += 1;
    if (play.effect === "#") {
      row.noTouchAces += 1;
      total.noTouchAces += 1;
    }
    if (play.effect === "+") {
      row.serviceAces += 1;
      total.serviceAces += 1;
    }
    if (play.effect === "!") {
      row.effective += 1;
      total.effective += 1;
    }
    if (isError(play)) {
      row.misses += 1;
      total.misses += 1;
    }
    players.set(key, row);
  });

  return getRowsWithTotal(players, total);
}

function buildReceptionMetricRows(plays: ParsedPlay[]): ReceptionMetricRow[] {
  const total: ReceptionMetricRow = {
    label: "チーム全体",
    attempts: 0,
    ab: 0,
    errors: 0,
  };
  const players = new Map<string, ReceptionMetricRow>();

  plays.filter((play) => play.skill === "R").forEach((play) => {
    const key = getPlayerKey(play);
    const row =
      players.get(key) ??
      {
        label: key,
        attempts: 0,
        ab: 0,
        errors: 0,
      };

    row.attempts += 1;
    total.attempts += 1;
    if (isReceptionAB(play)) {
      row.ab += 1;
      total.ab += 1;
    }
    if (isError(play)) {
      row.errors += 1;
      total.errors += 1;
    }
    players.set(key, row);
  });

  return getRowsWithTotal(players, total);
}

function getServeEffectRate(row: ServeMetricRow): number | undefined {
  if (row.attempts === 0) {
    return undefined;
  }

  return (
    (row.noTouchAces * 100 + row.serviceAces * 80 + row.effective * 25) /
    row.attempts
  );
}

function getAttackEffectRate(row: AttackMetricRow): number | undefined {
  if (row.attempts === 0) {
    return undefined;
  }

  return ((row.kills - row.errors) / row.attempts) * 100;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return value.toFixed(1);
}

function getTeamPlays(match: ParsedMatch | undefined, side: TeamSide): ParsedPlay[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  return match.sets.flatMap((set) =>
    set.events.flatMap((event) => event.plays.filter((play) => play.team === teamCode)),
  );
}

function buildFreeballSetDistribution(
  match: ParsedMatch | undefined,
  side: TeamSide,
): DistributionRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  const opponentCode = side === "home" ? "a" : "*";
  const rows = new Map<string, number>();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      event.plays.forEach((play, index) => {
        if (play.team !== opponentCode || play.skill !== "F") {
          return;
        }

        const attackPlay = event.plays
          .slice(index + 1)
          .find((candidate) => candidate.team === teamCode && candidate.skill === "A");
        if (!attackPlay) {
          return;
        }

        const label = attackPlay.hitType || attackPlay.code || "不明";
        rows.set(label, (rows.get(label) ?? 0) + 1);
      });
    });
  });

  const total = [...rows.values()].reduce((sum, count) => sum + count, 0);
  return [...rows.entries()]
    .map(([label, count]) => ({ label, count, total }))
    .sort((left, right) => right.count - left.count);
}

function buildBlockSetRows(match: ParsedMatch | undefined, side: TeamSide): BlockSetRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  return match.sets.map((set) => {
    const blocks = set.events.flatMap((event) =>
      event.plays.filter((play) => play.team === teamCode && play.skill === "B"),
    );

    return {
      setIndex: set.setIndex,
      successes: blocks.filter(isKill).length,
      misses: blocks.filter(isError).length,
    };
  });
}

function getAttackCourseType(play: ParsedPlay): keyof Omit<AttackCourseRow, "player"> | undefined {
  const start = getAttackStartPoint(play);
  const end = getAttackEndPoint(play);
  if (!end) {
    return undefined;
  }

  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance <= COURT_WIDTH / 2) {
    return "feint";
  }

  const angleFromNet = Math.atan2(Math.abs(end.y - start.y), Math.abs(end.x - start.x)) * (180 / Math.PI);
  if (angleFromNet >= 60 && angleFromNet <= 90) {
    return "straight";
  }

  return "cross";
}

function createAttackCourseRow(player: string): AttackCourseRow {
  return {
    player,
    feint: { attempts: 0, kills: 0 },
    straight: { attempts: 0, kills: 0 },
    cross: { attempts: 0, kills: 0 },
  };
}

function buildAttackCourseRows(plays: ParsedPlay[]): AttackCourseRow[] {
  const rows = new Map<string, AttackCourseRow>();

  plays.filter((play) => play.skill === "A").forEach((play) => {
    const player = getPlayerKey(play);
    const courseType = getAttackCourseType(play);
    if (!courseType) {
      return;
    }

    const row = rows.get(player) ?? createAttackCourseRow(player);
    row[courseType].attempts += 1;
    if (isKill(play)) {
      row[courseType].kills += 1;
    }
    rows.set(player, row);
  });

  return [...rows.values()].sort((left, right) =>
    left.player.localeCompare(right.player, "ja", {
      numeric: true,
    }),
  );
}

function buildServeBreakRows(
  match: ParsedMatch | undefined,
  side: TeamSide,
): ServeBreakRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  const rows = new Map<string, ServeBreakRow>();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const serve = event.plays.find(
        (play) => play.team === teamCode && play.skill === "S",
      );
      if (!serve) {
        return;
      }

      const player = getPlayerKey(serve);
      const row =
        rows.get(player) ??
        {
          player,
          attempts: 0,
          breaks: 0,
          nonMissAttempts: 0,
          nonMissBreaks: 0,
        };
      const won = getWinningSide(event) === side;

      row.attempts += 1;
      if (won) {
        row.breaks += 1;
      }
      if (!isError(serve)) {
        row.nonMissAttempts += 1;
        if (won) {
          row.nonMissBreaks += 1;
        }
      }
      rows.set(player, row);
    });
  });

  return [...rows.values()].sort((left, right) =>
    left.player.localeCompare(right.player, "ja", { numeric: true }),
  );
}

export function AnalysisPanel({ match }: AnalysisPanelProps) {
  const homeAnalysis = buildTeamAnalysis(match, "home");
  const awayAnalysis = buildTeamAnalysis(match, "away");
  const [activeSide, setActiveSide] = useState<TeamSide>("home");
  const [activeCategory, setActiveCategory] =
    useState<AnalysisCategory>("overview");
  const scoreTimeline = buildScoreTimeline(match);

  const activeAnalysis =
    activeSide === "home" ? homeAnalysis ?? awayAnalysis : awayAnalysis ?? homeAnalysis;
  const setOutcomeComparison = buildSetOutcomeComparison(match, activeAnalysis?.side ?? activeSide);
  const activeTeamPlays = getTeamPlays(match, activeAnalysis?.side ?? activeSide);
  const attackMetricRows = buildAttackMetricRows(activeTeamPlays);
  const serveMetricRows = buildServeMetricRows(activeTeamPlays);
  const receptionMetricRows = buildReceptionMetricRows(activeTeamPlays);
  const freeballSetRows = buildFreeballSetDistribution(
    match,
    activeAnalysis?.side ?? activeSide,
  );
  const blockSetRows = buildBlockSetRows(match, activeAnalysis?.side ?? activeSide);
  const attackCourseRows = buildAttackCourseRows(activeTeamPlays);
  const serveBreakRows = buildServeBreakRows(match, activeAnalysis?.side ?? activeSide);
  const gradeOrder = ["A", "B", "C", "D", "E", "F"];
  const comparisonSkills = setOutcomeComparison
    ? [
        ...new Set([
          ...setOutcomeComparison.won.skillSummary.map((row) => row.skill),
          ...setOutcomeComparison.lost.skillSummary.map((row) => row.skill),
        ]),
      ].sort((left, right) => getSkillLabel(left).localeCompare(getSkillLabel(right), "ja"))
    : [];
  const comparisonRotations = setOutcomeComparison
    ? [
        ...new Set([
          ...setOutcomeComparison.won.rotations.map((row) => row.rotationLabel),
          ...setOutcomeComparison.lost.rotations.map((row) => row.rotationLabel),
        ]),
      ].sort((left, right) => left.localeCompare(right, "ja"))
    : [];
  return (
    <section className="panel analysis-panel">
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

            <div className="tab-row" role="tablist" aria-label="分析カテゴリ切替">
              {ANALYSIS_CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  className={`tab-button${activeCategory === category.key ? " tab-button-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === category.key}
                  onClick={() => setActiveCategory(category.key)}
                >
                  {category.label}
                </button>
              ))}
            </div>

            {activeCategory === "overview" ? (
              <>
            <div className="meta-grid analysis-summary-grid">
              <div className="meta-card analysis-summary-card">
                <span className="muted">総得点率</span>
                <strong>{formatRate(activeAnalysis.wonRallies, activeAnalysis.rallyCount)}</strong>
              </div>
              <div className="meta-card analysis-summary-card">
                <span className="muted">Sideout%</span>
                <strong>
                  {formatRate(activeAnalysis.sideoutWins, activeAnalysis.sideoutAttempts)}
                </strong>
              </div>
              <div className="meta-card analysis-summary-card">
                <span className="muted">Break%</span>
                <strong>
                  {formatRate(activeAnalysis.breakWins, activeAnalysis.breakAttempts)}
                </strong>
              </div>
              <div className="meta-card analysis-summary-card">
                <span className="muted">ラリー数</span>
                <strong>{activeAnalysis.rallyCount}</strong>
              </div>
            </div>

            {setOutcomeComparison ? (
              <div className="analysis-block analysis-section-block">
                <h3>勝ちセット / 負けセット比較</h3>
                <p className="muted">
                  勝ちセット: {setOutcomeComparison.wonSetLabels} / 負けセット:{" "}
                  {setOutcomeComparison.lostSetLabels}
                </p>

                <div className="comparison-stack">
                  <div>
                    <h4>スキル別評価分布</h4>
                    <div className="comparison-chart" aria-label="勝ちセットと負けセットのスキル別評価分布">
                      {comparisonSkills.map((skill) => {
                        const won = getSkillSummaryRow(
                          setOutcomeComparison.won.skillSummary,
                          skill,
                        );
                        const lost = getSkillSummaryRow(
                          setOutcomeComparison.lost.skillSummary,
                          skill,
                        );

                        return (
                          <div className="comparison-chart-row" key={skill}>
                            <div className="comparison-chart-label">
                              <strong>{getSkillLabel(skill)}</strong>
                              <span className="muted">
                                勝ち {won.count} / 負け {lost.count}
                              </span>
                            </div>
                            <div className="comparison-bars">
                              <div className="comparison-bar-line">
                                <span className="comparison-bar-name">勝ち</span>
                                <div className="comparison-bar-track comparison-grade-track">
                                  {gradeOrder.map((grade) => {
                                    const count = won.gradeCounts[grade] ?? 0;
                                    const percent =
                                      won.count > 0 ? (count / won.count) * 100 : 0;
                                    return (
                                      <div
                                        className={`comparison-grade-segment skill-bar-grade-${grade}`}
                                        key={grade}
                                        style={{ width: `${percent}%` }}
                                        title={`${grade}: ${count}`}
                                      />
                                    );
                                  })}
                                </div>
                                <span className="mono comparison-bar-value">
                                  {won.count}
                                </span>
                                <span className="comparison-grade-values">
                                  {gradeOrder.map((grade) => (
                                    <span
                                      className={`tag skill-grade-tag skill-grade-tag-${grade}`}
                                      key={grade}
                                    >
                                      {grade} {won.gradeCounts[grade] ?? 0}
                                    </span>
                                  ))}
                                </span>
                              </div>
                              <div className="comparison-bar-line">
                                <span className="comparison-bar-name">負け</span>
                                <div className="comparison-bar-track comparison-grade-track">
                                  {gradeOrder.map((grade) => {
                                    const count = lost.gradeCounts[grade] ?? 0;
                                    const percent =
                                      lost.count > 0 ? (count / lost.count) * 100 : 0;
                                    return (
                                      <div
                                        className={`comparison-grade-segment skill-bar-grade-${grade}`}
                                        key={grade}
                                        style={{ width: `${percent}%` }}
                                        title={`${grade}: ${count}`}
                                      />
                                    );
                                  })}
                                </div>
                                <span className="mono comparison-bar-value">
                                  {lost.count}
                                </span>
                                <span className="comparison-grade-values">
                                  {gradeOrder.map((grade) => (
                                    <span
                                      className={`tag skill-grade-tag skill-grade-tag-${grade}`}
                                      key={grade}
                                    >
                                      {grade} {lost.gradeCounts[grade] ?? 0}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4>ローテーション別得点率</h4>
                    <div className="comparison-chart" aria-label="勝ちセットと負けセットのローテーション別得点率">
                      {comparisonRotations.map((rotationLabel) => {
                        const won = getRotationRow(
                          setOutcomeComparison.won.rotations,
                          rotationLabel,
                        );
                        const lost = getRotationRow(
                          setOutcomeComparison.lost.rotations,
                          rotationLabel,
                        );
                        const metrics = [
                          {
                            label: "得点率",
                            wonRate: getRate(won.wins, won.attempts),
                            lostRate: getRate(lost.wins, lost.attempts),
                            wonValue: `${won.wins}/${won.attempts}`,
                            lostValue: `${lost.wins}/${lost.attempts}`,
                            diff: formatSignedRateDiff(
                              won.wins,
                              won.attempts,
                              lost.wins,
                              lost.attempts,
                            ),
                          },
                          {
                            label: "Sideout%",
                            wonRate: getRate(won.sideoutWins, won.sideoutAttempts),
                            lostRate: getRate(lost.sideoutWins, lost.sideoutAttempts),
                            wonValue: `${won.sideoutWins}/${won.sideoutAttempts}`,
                            lostValue: `${lost.sideoutWins}/${lost.sideoutAttempts}`,
                            diff: formatSignedRateDiff(
                              won.sideoutWins,
                              won.sideoutAttempts,
                              lost.sideoutWins,
                              lost.sideoutAttempts,
                            ),
                          },
                          {
                            label: "Break%",
                            wonRate: getRate(won.breakWins, won.breakAttempts),
                            lostRate: getRate(lost.breakWins, lost.breakAttempts),
                            wonValue: `${won.breakWins}/${won.breakAttempts}`,
                            lostValue: `${lost.breakWins}/${lost.breakAttempts}`,
                            diff: formatSignedRateDiff(
                              won.breakWins,
                              won.breakAttempts,
                              lost.breakWins,
                              lost.breakAttempts,
                            ),
                          },
                        ];

                        return (
                          <div className="comparison-chart-row" key={rotationLabel}>
                            <div className="comparison-chart-label">
                              <strong>{rotationLabel}</strong>
                              <span className="muted">勝ちセット / 負けセット</span>
                            </div>
                            <div className="comparison-metric-stack">
                              {metrics.map((metric) => (
                                <div className="comparison-metric-block" key={metric.label}>
                                  <div className="comparison-metric-heading">
                                    <strong>{metric.label}</strong>
                                    <span className="muted">差分 {metric.diff}</span>
                                  </div>
                                  <div className="comparison-bars">
                                    <div className="comparison-bar-line">
                                      <span className="comparison-bar-name">勝ち</span>
                                      <div className="comparison-bar-track">
                                        <div
                                          className="comparison-bar-fill comparison-bar-fill-won"
                                          style={{ width: `${metric.wonRate ?? 0}%` }}
                                        />
                                      </div>
                                      <span className="mono comparison-bar-value">
                                        {formatPercent(metric.wonRate)}
                                      </span>
                                      <span className="muted comparison-count">
                                        {metric.wonValue}
                                      </span>
                                    </div>
                                    <div className="comparison-bar-line">
                                      <span className="comparison-bar-name">負け</span>
                                      <div className="comparison-bar-track">
                                        <div
                                          className="comparison-bar-fill comparison-bar-fill-lost"
                                          style={{ width: `${metric.lostRate ?? 0}%` }}
                                        />
                                      </div>
                                      <span className="mono comparison-bar-value">
                                        {formatPercent(metric.lostRate)}
                                      </span>
                                      <span className="muted comparison-count">
                                        {metric.lostValue}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="analysis-block analysis-section-block">
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

            <div className="analysis-block analysis-section-block">
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
              </>
            ) : null}

            {activeCategory === "attack" ? (
              <>
            <div className="analysis-block analysis-section-block">
              <h3>アタック指標</h3>
              <p className="muted">
                決定率 = 得点数÷打数、効果率 =（得点数−失点数）÷打数。
              </p>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>選手</th>
                      <th>打数</th>
                      <th>得点</th>
                      <th>失点</th>
                      <th>決定率</th>
                      <th>効果率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attackMetricRows.map((row) => (
                      <tr key={row.label}>
                        <td data-label="選手">{row.label}</td>
                        <td data-label="打数">{row.attempts}</td>
                        <td data-label="得点">{row.kills}</td>
                        <td data-label="失点">{row.errors}</td>
                        <td data-label="決定率">
                          {formatRate(row.kills, row.attempts)}
                        </td>
                        <td data-label="効果率">{formatPercent(getAttackEffectRate(row))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {activeCategory === "serve" ? (
              <>
            <div className="analysis-block analysis-section-block">
              <h3>サーブ指標</h3>
              <p className="muted">
                効果率 =（ノータッチエース×100 + サービスエース×80 + 効果×25）÷打数。
              </p>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>選手</th>
                      <th>打数</th>
                      <th>ノータッチ</th>
                      <th>サービスエース</th>
                      <th>効果</th>
                      <th>ミス</th>
                      <th>効果率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serveMetricRows.map((row) => (
                      <tr key={row.label}>
                        <td data-label="選手">{row.label}</td>
                        <td data-label="打数">{row.attempts}</td>
                        <td data-label="ノータッチ">{row.noTouchAces}</td>
                        <td data-label="サービスエース">{row.serviceAces}</td>
                        <td data-label="効果">{row.effective}</td>
                        <td data-label="ミス">{row.misses}</td>
                        <td data-label="効果率">{formatNumber(getServeEffectRate(row))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {activeCategory === "reception" ? (
              <>
            <div className="analysis-block analysis-section-block">
              <h3>レセプション</h3>
              <p className="muted">AB率は # / +、ミス率は = で計算します。</p>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>選手</th>
                      <th>本数</th>
                      <th>AB</th>
                      <th>ミス</th>
                      <th>AB率</th>
                      <th>ミス率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receptionMetricRows.map((row) => (
                      <tr key={row.label}>
                        <td data-label="選手">{row.label}</td>
                        <td data-label="本数">{row.attempts}</td>
                        <td data-label="AB">{row.ab}</td>
                        <td data-label="ミス">{row.errors}</td>
                        <td data-label="AB率">{formatRate(row.ab, row.attempts)}</td>
                        <td data-label="ミス率">{formatRate(row.errors, row.attempts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {activeCategory === "attack" ? (
              <>
            <div className="analysis-block analysis-section-block">
              <h3>フリーボール後の攻撃配分</h3>
              <p className="muted">相手フリーボールの後、最初に出た自チームの攻撃を集計します。</p>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>攻撃</th>
                      <th>本数</th>
                      <th>配分率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freeballSetRows.length === 0 ? (
                      <tr>
                        <td colSpan={3}>該当データなし</td>
                      </tr>
                    ) : (
                      freeballSetRows.map((row) => (
                        <tr key={row.label}>
                          <td data-label="攻撃">{row.label}</td>
                          <td data-label="本数">{row.count}</td>
                          <td data-label="配分率">{formatRate(row.count, row.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {activeCategory === "block" ? (
              <>
            <div className="analysis-block analysis-section-block">
              <h3>セット別ブロック</h3>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>セット</th>
                      <th>成功</th>
                      <th>ミス</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockSetRows.map((row) => (
                      <tr key={row.setIndex}>
                        <td data-label="セット">セット {row.setIndex}</td>
                        <td data-label="成功">{row.successes}</td>
                        <td data-label="ミス">{row.misses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {activeCategory === "attack" ? (
              <>
            <div className="analysis-block analysis-section-block">
              <h3>選手別コース決定率</h3>
              <p className="muted">
                落下地点が打点からコート横幅の半分以内ならフェイント、軌道とネットの角度が60〜90度ならストレート、それ以外はクロスに分類します。
              </p>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>選手</th>
                      <th>フェイント</th>
                      <th>ストレート</th>
                      <th>クロス</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attackCourseRows.map((row) => (
                      <tr key={row.player}>
                        <td data-label="選手">{row.player}</td>
                        <td data-label="フェイント">
                          {formatAttackCourseSummary(row.feint)}
                        </td>
                        <td data-label="ストレート">
                          {formatAttackCourseSummary(row.straight)}
                        </td>
                        <td data-label="クロス">
                          {formatAttackCourseSummary(row.cross)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {activeCategory === "serve" ? (
              <>
            <div className="analysis-block analysis-section-block">
              <h3>サーブ時のブレイク率比較</h3>
              <p className="muted">ミス込みと、サーブミスを除いた場合を比較します。</p>
              <div className="score-table-wrap">
                <table className="score-table analysis-player-table">
                  <thead>
                    <tr>
                      <th>選手</th>
                      <th>ミス込み</th>
                      <th>ミス除外</th>
                      <th>差分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serveBreakRows.map((row) => {
                      const includedRate = getRate(row.breaks, row.attempts);
                      const nonMissRate = getRate(row.nonMissBreaks, row.nonMissAttempts);
                      const diff =
                        includedRate === undefined || nonMissRate === undefined
                          ? undefined
                          : nonMissRate - includedRate;

                      return (
                        <tr key={row.player}>
                          <td data-label="選手">{row.player}</td>
                          <td data-label="ミス込み">
                            {formatPercent(includedRate)} ({row.breaks}/{row.attempts})
                          </td>
                          <td data-label="ミス除外">
                            {formatPercent(nonMissRate)} ({row.nonMissBreaks}/
                            {row.nonMissAttempts})
                          </td>
                          <td data-label="差分">
                            {diff === undefined
                              ? "-"
                              : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pt`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {activeCategory === "player" ? (
              <>
            <div className="analysis-block analysis-section-block">
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
                        <td data-label="背番号">{row.player}</td>
                        <td data-label="総プレイ">{row.total}</td>
                        <td data-label="サーブ">{row.serve}</td>
                        <td data-label="レセプション">{row.receive}</td>
                        <td data-label="アタック">{row.attack}</td>
                        <td data-label="ブロック">{row.block}</td>
                        <td data-label="直接得点">{row.directPoints}</td>
                        <td data-label="ミス">{row.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
