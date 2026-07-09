import { getEffectGrade } from "@/lib/domain/display";
import type { ParsedEvent, ParsedMatch, ParsedPlay, ParsedSet, TeamSide } from "@/lib/domain/types";

export type SkillSummaryRow = {
  skill: string;
  count: number;
  gradeCounts: Record<string, number>;
};

export type RotationRow = {
  rotationLabel: string;
  attempts: number;
  wins: number;
  sideoutAttempts: number;
  sideoutWins: number;
  breakAttempts: number;
  breakWins: number;
};

export type PlayerRow = {
  player: string;
  total: number;
  serve: number;
  receive: number;
  attack: number;
  block: number;
  directPoints: number;
  errors: number;
};

export type TeamAnalysis = {
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

export type ScoreTimelinePoint = {
  rallyIndex: number;
  home: number;
  away: number;
};

export type SetOutcomeComparison = {
  won: TeamAnalysis;
  lost: TeamAnalysis;
  wonSetLabels: string;
  lostSetLabels: string;
};

export type AttackMetricRow = {
  label: string;
  attempts: number;
  kills: number;
  errors: number;
};

export type ServeMetricRow = {
  label: string;
  attempts: number;
  noTouchAces: number;
  serviceAces: number;
  effective: number;
  misses: number;
};

export type ReceptionMetricRow = {
  label: string;
  attempts: number;
  ab: number;
  errors: number;
};

export type DistributionRow = {
  label: string;
  count: number;
  total: number;
};

export type BlockSetRow = {
  setIndex: number;
  opponentAttacks: number;
  successes: number;
  misses: number;
};

type Point = {
  x: number;
  y: number;
};

export type AttackCourseSummary = {
  attempts: number;
  kills: number;
};

export type AttackCourseRow = {
  player: string;
  feint: AttackCourseSummary;
  straight: AttackCourseSummary;
  cross: AttackCourseSummary;
};

export type ServeBreakRow = {
  player: string;
  attempts: number;
  breaks: number;
  nonMissAttempts: number;
  nonMissBreaks: number;
};

export type AnalysisMatchInput = {
  id: string;
  name: string;
  match: ParsedMatch;
  ownSide: TeamSide;
};

export type AggregateSetScope = "all" | "won" | "lost";

export type MatchSummaryRow = {
  id: string;
  name: string;
  opponent: string;
  side: TeamSide;
  setScore: string;
  rallyCount: number;
  wonRallies: number;
  sideoutAttempts: number;
  sideoutWins: number;
  breakAttempts: number;
  breakWins: number;
};

export type AggregateAnalysis = {
  matchCount: number;
  setCount: number;
  teamAnalysis: TeamAnalysis;
  teamPlays: ParsedPlay[];
  matchSummaries: MatchSummaryRow[];
  attackMetricRows: AttackMetricRow[];
  serveMetricRows: ServeMetricRow[];
  receptionMetricRows: ReceptionMetricRow[];
  freeballAttackRows: DistributionRow[];
  blockOpponentAttacks: number;
  blockSetRows: BlockSetRow[];
  attackCourseRows: AttackCourseRow[];
  serveBreakRows: ServeBreakRow[];
};

export function getTeamCode(side: TeamSide) {
  return side === "home" ? "*" : "a";
}

export function getWinningSide(event: ParsedEvent): TeamSide | undefined {
  if (event.point === "*") {
    return "home";
  }
  if (event.point === "a") {
    return "away";
  }
  return undefined;
}

export function getFirstPlayForSide(event: ParsedEvent, side: TeamSide): ParsedPlay | undefined {
  const teamCode = getTeamCode(side);
  return event.plays.find((play) => play.team === teamCode);
}

export function buildSkillSummary(plays: ParsedPlay[]): SkillSummaryRow[] {
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

export function buildRotationRows(sets: ParsedSet[], side: TeamSide): RotationRow[] {
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

export function buildPlayerRows(plays: ParsedPlay[]): PlayerRow[] {
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

export function buildTeamAnalysis(
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

export function getSetWinningSide(set: ParsedSet): TeamSide | undefined {
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

export function buildSetOutcomeComparison(
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

export function buildScoreTimeline(match: ParsedMatch | undefined) {
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

export function getSkillSummaryRow(summary: SkillSummaryRow[], skill: string): SkillSummaryRow {
  return (
    summary.find((row) => row.skill === skill) ?? {
      skill,
      count: 0,
      gradeCounts: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    }
  );
}

export function getRotationRow(rows: RotationRow[], rotationLabel: string): RotationRow {
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

export function getPlayerKey(play: ParsedPlay) {
  return play.player ?? "不明";
}

export function isKill(play: ParsedPlay) {
  return play.effect === "#";
}

export function isError(play: ParsedPlay) {
  return play.effect === "=";
}

function isReceptionAB(play: ParsedPlay) {
  return play.effect === "#" || play.effect === "+";
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

export function buildAttackMetricRows(plays: ParsedPlay[]): AttackMetricRow[] {
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

export function buildServeMetricRows(plays: ParsedPlay[]): ServeMetricRow[] {
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

export function buildReceptionMetricRows(plays: ParsedPlay[]): ReceptionMetricRow[] {
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

export function getServeEffectRate(row: ServeMetricRow): number | undefined {
  if (row.attempts === 0) {
    return undefined;
  }

  return (
    (row.noTouchAces * 100 + row.serviceAces * 80 + row.effective * 25) /
    row.attempts
  );
}

export function getAttackEffectRate(row: AttackMetricRow): number | undefined {
  if (row.attempts === 0) {
    return undefined;
  }

  return ((row.kills - row.errors) / row.attempts) * 100;
}

export function getRate(wins: number, attempts: number): number | undefined {
  if (attempts === 0) {
    return undefined;
  }

  return (wins / attempts) * 100;
}

export function getTeamPlays(match: ParsedMatch | undefined, side: TeamSide): ParsedPlay[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  return match.sets.flatMap((set) =>
    set.events.flatMap((event) => event.plays.filter((play) => play.team === teamCode)),
  );
}

export function buildFreeballAttackDistribution(
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

export function buildBlockSetRows(match: ParsedMatch | undefined, side: TeamSide): BlockSetRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  const opponentCode = side === "home" ? "a" : "*";
  return match.sets.map((set) => {
    const blocks = set.events.flatMap((event) =>
      event.plays.filter((play) => play.team === teamCode && play.skill === "B"),
    );
    const opponentAttacks = set.events.flatMap((event) =>
      event.plays.filter((play) => play.team === opponentCode && play.skill === "A"),
    ).length;

    return {
      setIndex: set.setIndex,
      opponentAttacks,
      successes: blocks.filter(isKill).length,
      misses: blocks.filter(isError).length,
    };
  });
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

export function buildAttackCourseRows(plays: ParsedPlay[]): AttackCourseRow[] {
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

export function buildServeBreakRows(
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

export function mergeDistributionRows(rows: DistributionRow[][]): DistributionRow[] {
  const counts = new Map<string, number>();
  rows.flat().forEach((row) => {
    counts.set(row.label, (counts.get(row.label) ?? 0) + row.count);
  });
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, total }))
    .sort((left, right) => right.count - left.count);
}

export function mergeServeBreakRows(rows: ServeBreakRow[][]): ServeBreakRow[] {
  const merged = new Map<string, ServeBreakRow>();
  rows.flat().forEach((row) => {
    const current =
      merged.get(row.player) ??
      {
        player: row.player,
        attempts: 0,
        breaks: 0,
        nonMissAttempts: 0,
        nonMissBreaks: 0,
      };
    current.attempts += row.attempts;
    current.breaks += row.breaks;
    current.nonMissAttempts += row.nonMissAttempts;
    current.nonMissBreaks += row.nonMissBreaks;
    merged.set(row.player, current);
  });

  return [...merged.values()].sort((left, right) =>
    left.player.localeCompare(right.player, "ja", { numeric: true }),
  );
}

function getScopedMatch(input: AnalysisMatchInput, scope: AggregateSetScope): ParsedMatch {
  if (scope === "all") {
    return input.match;
  }

  return {
    ...input.match,
    sets: input.match.sets.filter((set) => {
      const winningSide = getSetWinningSide(set);
      if (scope === "won") {
        return winningSide === input.ownSide;
      }
      return winningSide !== undefined && winningSide !== input.ownSide;
    }),
  };
}

export function buildAggregateAnalysis(
  inputs: AnalysisMatchInput[],
  scope: AggregateSetScope = "all",
): AggregateAnalysis {
  const scopedInputs = inputs.map((input) => ({
    ...input,
    match: getScopedMatch(input, scope),
  }));
  const teamPlays = scopedInputs.flatMap((input) => getTeamPlays(input.match, input.ownSide));
  const totalAnalysis: TeamAnalysis = {
    side: "home",
    name: "選択試合合計",
    rallyCount: 0,
    wonRallies: 0,
    sideoutAttempts: 0,
    sideoutWins: 0,
    breakAttempts: 0,
    breakWins: 0,
    skillSummary: buildSkillSummary(teamPlays),
    rotations: [],
    players: buildPlayerRows(teamPlays),
  };

  const matchSummaries = scopedInputs.map<MatchSummaryRow>((input) => {
    const analysis = buildTeamAnalysis(input.match, input.ownSide);
    if (analysis) {
      totalAnalysis.rallyCount += analysis.rallyCount;
      totalAnalysis.wonRallies += analysis.wonRallies;
      totalAnalysis.sideoutAttempts += analysis.sideoutAttempts;
      totalAnalysis.sideoutWins += analysis.sideoutWins;
      totalAnalysis.breakAttempts += analysis.breakAttempts;
      totalAnalysis.breakWins += analysis.breakWins;
    }

    const opponent =
      input.ownSide === "home"
        ? input.match.teams.away.name
        : input.match.teams.home.name;
    const ownSets = input.match.sets.filter((set) => getSetWinningSide(set) === input.ownSide).length;
    const opponentSets = input.match.sets.filter((set) => {
      const winningSide = getSetWinningSide(set);
      return winningSide !== undefined && winningSide !== input.ownSide;
    }).length;

    return {
      id: input.id,
      name: input.name,
      opponent,
      side: input.ownSide,
      setScore: `${ownSets}-${opponentSets}`,
      rallyCount: analysis?.rallyCount ?? 0,
      wonRallies: analysis?.wonRallies ?? 0,
      sideoutAttempts: analysis?.sideoutAttempts ?? 0,
      sideoutWins: analysis?.sideoutWins ?? 0,
      breakAttempts: analysis?.breakAttempts ?? 0,
      breakWins: analysis?.breakWins ?? 0,
    };
  });

  return {
    matchCount: inputs.length,
    setCount: scopedInputs.reduce((sum, input) => sum + input.match.sets.length, 0),
    teamAnalysis: totalAnalysis,
    teamPlays,
    matchSummaries,
    attackMetricRows: buildAttackMetricRows(teamPlays),
    serveMetricRows: buildServeMetricRows(teamPlays),
    receptionMetricRows: buildReceptionMetricRows(teamPlays),
    freeballAttackRows: mergeDistributionRows(
      scopedInputs.map((input) => buildFreeballAttackDistribution(input.match, input.ownSide)),
    ),
    blockOpponentAttacks: scopedInputs.reduce((sum, input) => {
      const opponentCode = input.ownSide === "home" ? "a" : "*";
      return (
        sum +
        input.match.sets.reduce(
          (setSum, set) =>
            setSum +
            set.events.reduce(
              (eventSum, event) =>
                eventSum +
                event.plays.filter(
                  (play) => play.team === opponentCode && play.skill === "A",
                ).length,
              0,
            ),
          0,
        )
      );
    }, 0),
    blockSetRows: scopedInputs.flatMap((input, matchIndex) =>
      buildBlockSetRows(input.match, input.ownSide).map((row) => ({
        ...row,
        setIndex: matchIndex * 100 + row.setIndex,
      })),
    ),
    attackCourseRows: buildAttackCourseRows(teamPlays),
    serveBreakRows: mergeServeBreakRows(
      scopedInputs.map((input) => buildServeBreakRows(input.match, input.ownSide)),
    ),
  };
}
