import { getEffectGrade } from "@/lib/domain/display";
import type {
  MatchPlayer,
  ParsedEvent,
  ParsedMatch,
  ParsedPlay,
  ParsedSet,
  TeamSide,
} from "@/lib/domain/types";

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

export type RotationPointCauseRow = {
  rotationLabel: string;
  wonRallies: number;
  sideoutWins: number;
  breakWins: number;
  servePoints: number;
  attackPoints: number;
  blockPoints: number;
  opponentErrors: number;
  lostRallies: number;
  sideoutLosses: number;
  breakLosses: number;
  receptionErrors: number;
  serveErrors: number;
  attackErrors: number;
  opponentBlockPoints: number;
  opponentAttackPoints: number;
  otherErrors: number;
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
  attackErrors: number;
  blockedErrors: number;
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
  bc: number;
  errors: number;
};

export type DistributionRow = {
  label: string;
  count: number;
  total: number;
};

export type FreeballAttackRow = {
  code: string;
  label: string;
  count: number;
  setterReceivedCount: number;
  kills: number;
  total: number;
};

export type BlockAttackRow = {
  code: string;
  label: string;
  count: number;
  opponentAttackCount: number;
  total: number;
};

export type BlockSetRow = {
  setIndex: number;
  opponentAttacks: number;
  successes: number;
  misses: number;
};

export type BlockPlayerRow = {
  player: string;
  setAppearances: number;
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
  opponentAnalysis: TeamAnalysis;
  teamPlays: ParsedPlay[];
  opponentPlays: ParsedPlay[];
  matchSummaries: MatchSummaryRow[];
  rotationPointCauseRows: RotationPointCauseRow[];
  attackMetricRows: AttackMetricRow[];
  serveMetricRows: ServeMetricRow[];
  receptionMetricRows: ReceptionMetricRow[];
  freeballAttackRows: FreeballAttackRow[];
  blockOpponentAttacks: number;
  blockSetRows: BlockSetRow[];
  blockPlayerRows: BlockPlayerRow[];
  blockSuccessRows: BlockAttackRow[];
  blockMissRows: BlockAttackRow[];
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
    const key = getPlayerKey(play);
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

export function mergeRotationRows(rows: RotationRow[][]): RotationRow[] {
  const merged = new Map<string, RotationRow>();

  rows.flat().forEach((row) => {
    const current = merged.get(row.rotationLabel) ?? {
      rotationLabel: row.rotationLabel,
      attempts: 0,
      wins: 0,
      sideoutAttempts: 0,
      sideoutWins: 0,
      breakAttempts: 0,
      breakWins: 0,
    };
    current.attempts += row.attempts;
    current.wins += row.wins;
    current.sideoutAttempts += row.sideoutAttempts;
    current.sideoutWins += row.sideoutWins;
    current.breakAttempts += row.breakAttempts;
    current.breakWins += row.breakWins;
    merged.set(row.rotationLabel, current);
  });

  return [1, 2, 3, 4, 5, 6].map((rotation) =>
    getRotationRow([...merged.values()], `ローテ${rotation}`),
  );
}

function createRotationPointCauseRow(rotationLabel: string): RotationPointCauseRow {
  return {
    rotationLabel,
    wonRallies: 0,
    sideoutWins: 0,
    breakWins: 0,
    servePoints: 0,
    attackPoints: 0,
    blockPoints: 0,
    opponentErrors: 0,
    lostRallies: 0,
    sideoutLosses: 0,
    breakLosses: 0,
    receptionErrors: 0,
    serveErrors: 0,
    attackErrors: 0,
    opponentBlockPoints: 0,
    opponentAttackPoints: 0,
    otherErrors: 0,
  };
}

function getRotationLabelForEvent(event: ParsedEvent, side: TeamSide) {
  const setterAt = event.lineup[side].setterAt ?? 0;
  return `ローテ${setterAt || "-"}`;
}

function getLastPlay(
  plays: ParsedPlay[],
  predicate: (play: ParsedPlay) => boolean,
) {
  return [...plays].reverse().find(predicate);
}

export function buildRotationPointCauseRows(
  match: ParsedMatch | undefined,
  side: TeamSide,
): RotationPointCauseRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  const opponentCode = side === "home" ? "a" : "*";
  const rows = new Map<string, RotationPointCauseRow>();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const winningSide = getWinningSide(event);
      if (!winningSide) {
        return;
      }

      const rotationLabel = getRotationLabelForEvent(event, side);
      const row =
        rows.get(rotationLabel) ?? createRotationPointCauseRow(rotationLabel);
      const firstPlay = getFirstPlayForSide(event, side);

      if (winningSide === side) {
        row.wonRallies += 1;
        if (firstPlay?.skill === "R") {
          row.sideoutWins += 1;
        }
        if (firstPlay?.skill === "S") {
          row.breakWins += 1;
        }
        const servePoint = getLastPlay(
          event.plays,
          (play) =>
            play.team === teamCode &&
            play.skill === "S" &&
            (play.effect === "#" || play.effect === "+"),
        );
        const attackPoint = getLastPlay(
          event.plays,
          (play) => play.team === teamCode && play.skill === "A" && isKill(play),
        );
        const blockPoint = getLastPlay(
          event.plays,
          (play) => play.team === teamCode && play.skill === "B" && isKill(play),
        );
        const opponentError = getLastPlay(
          event.plays,
          (play) => play.team === opponentCode && isError(play),
        );

        if (servePoint) {
          row.servePoints += 1;
        } else if (attackPoint) {
          row.attackPoints += 1;
        } else if (blockPoint) {
          row.blockPoints += 1;
        } else if (opponentError) {
          row.opponentErrors += 1;
        }
      } else {
        row.lostRallies += 1;
        if (firstPlay?.skill === "R") {
          row.sideoutLosses += 1;
        }
        if (firstPlay?.skill === "S") {
          row.breakLosses += 1;
        }
        const receptionError = getLastPlay(
          event.plays,
          (play) => play.team === teamCode && play.skill === "R" && isError(play),
        );
        const serveError = getLastPlay(
          event.plays,
          (play) => play.team === teamCode && play.skill === "S" && isError(play),
        );
        const attackError = getLastPlay(
          event.plays,
          (play) => play.team === teamCode && play.skill === "A" && isError(play),
        );
        const opponentBlockPoint = getLastPlay(
          event.plays,
          (play) => play.team === opponentCode && play.skill === "B" && isKill(play),
        );
        const blockedAttack = getLastPlay(
          event.plays,
          (play) => play.team === teamCode && play.skill === "A" && play.effect === "/",
        );
        const opponentAttackPoint = getLastPlay(
          event.plays,
          (play) => play.team === opponentCode && play.skill === "A" && isKill(play),
        );
        const otherError = getLastPlay(
          event.plays,
          (play) =>
            play.team === teamCode &&
            isError(play) &&
            play.skill !== "R" &&
            play.skill !== "S" &&
            play.skill !== "A",
        );

        if (receptionError) {
          row.receptionErrors += 1;
        } else if (serveError) {
          row.serveErrors += 1;
        } else if (attackError) {
          row.attackErrors += 1;
        } else if (opponentBlockPoint || blockedAttack) {
          row.opponentBlockPoints += 1;
        } else if (opponentAttackPoint) {
          row.opponentAttackPoints += 1;
        } else if (otherError) {
          row.otherErrors += 1;
        }
      }

      rows.set(rotationLabel, row);
    });
  });

  return [1, 2, 3, 4, 5, 6].map(
    (rotation) =>
      rows.get(`ローテ${rotation}`) ??
      createRotationPointCauseRow(`ローテ${rotation}`),
  );
}

export function mergeRotationPointCauseRows(
  rows: RotationPointCauseRow[][],
): RotationPointCauseRow[] {
  const merged = new Map<string, RotationPointCauseRow>();

  rows.flat().forEach((row) => {
    const current =
      merged.get(row.rotationLabel) ??
      createRotationPointCauseRow(row.rotationLabel);
    current.wonRallies += row.wonRallies;
    current.sideoutWins += row.sideoutWins;
    current.breakWins += row.breakWins;
    current.servePoints += row.servePoints;
    current.attackPoints += row.attackPoints;
    current.blockPoints += row.blockPoints;
    current.opponentErrors += row.opponentErrors;
    current.lostRallies += row.lostRallies;
    current.sideoutLosses += row.sideoutLosses;
    current.breakLosses += row.breakLosses;
    current.receptionErrors += row.receptionErrors;
    current.serveErrors += row.serveErrors;
    current.attackErrors += row.attackErrors;
    current.opponentBlockPoints += row.opponentBlockPoints;
    current.opponentAttackPoints += row.opponentAttackPoints;
    current.otherErrors += row.otherErrors;
    merged.set(row.rotationLabel, current);
  });

  return [1, 2, 3, 4, 5, 6].map(
    (rotation) =>
      merged.get(`ローテ${rotation}`) ??
      createRotationPointCauseRow(`ローテ${rotation}`),
  );
}

export function getPlayerKey(play: ParsedPlay) {
  return normalizePlayerNumber(play.player) ?? "不明";
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

function isReceptionBC(play: ParsedPlay) {
  return play.effect === "+" || play.effect === "!";
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
    attackErrors: 0,
    blockedErrors: 0,
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
        attackErrors: 0,
        blockedErrors: 0,
        errors: 0,
      };

    row.attempts += 1;
    total.attempts += 1;
    if (isKill(play)) {
      row.kills += 1;
      total.kills += 1;
    }
    if (isError(play)) {
      row.attackErrors += 1;
      row.errors += 1;
      total.attackErrors += 1;
      total.errors += 1;
    }
    if (play.effect === "/") {
      row.blockedErrors += 1;
      row.errors += 1;
      total.blockedErrors += 1;
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
    bc: 0,
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
        bc: 0,
        errors: 0,
      };

    row.attempts += 1;
    total.attempts += 1;
    if (isReceptionAB(play)) {
      row.ab += 1;
      total.ab += 1;
    }
    if (isReceptionBC(play)) {
      row.bc += 1;
      total.bc += 1;
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
    ((row.noTouchAces + row.serviceAces) * 100 +
      row.effective * 25 -
      row.misses * 25) /
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

function isGradeF(play: ParsedPlay) {
  return play.effect === "F" || getEffectGrade(play.effect) === "F";
}

function hasCodeToken(play: ParsedPlay, token: string) {
  return (play.code ?? "").toUpperCase().includes(token);
}

function isOverpassAttack(play: ParsedPlay) {
  return (
    play.skill === "A" &&
    (play.hitType?.trim().toUpperCase() === "O" || hasCodeToken(play, "AO"))
  );
}

function isOverpassDig(play: ParsedPlay) {
  return (
    play.skill === "D" &&
    (play.hitType?.trim().toUpperCase() === "O" || hasCodeToken(play, "DO"))
  );
}

function getAttackCombinationLabel(play: ParsedPlay) {
  const combination = play.combination?.trim().toUpperCase();
  if (combination) {
    return combination;
  }

  const code = play.code?.trim().toUpperCase();
  const codeMatch = code?.match(/P[A-Z0-9]/);
  if (codeMatch) {
    return codeMatch[0];
  }

  return play.code || play.hitType || "不明";
}

function getFreeballAttackDisplay(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const displayMap: Record<string, { code: string; label: string }> = {
    PV: { code: "PV", label: "レフト平行" },
    PA: { code: "PA", label: "Aクイック" },
    PB: { code: "PB", label: "Bクイック" },
    PW: { code: "PW", label: "レフトセミ" },
    PX: { code: "PX", label: "セミ" },
    PY: { code: "PY", label: "ライトセミ" },
    PZ: { code: "PZ", label: "ライト平行" },
    P1: { code: "P1/P2", label: "レフトオープン" },
    P2: { code: "P1/P2", label: "レフトオープン" },
    P3: { code: "P3", label: "センターオープン" },
    P4: { code: "P4/P5", label: "ライトオープン" },
    P5: { code: "P4/P5", label: "ライトオープン" },
    P8: { code: "P8", label: "パイプ" },
    P9: { code: "P9", label: "シャー" },
  };

  return displayMap[normalizedCode] ?? {
    code: "その他",
    label: "その他",
  };
}

const BLOCK_ZONE_DISPLAYS = [
  { code: "ゾーン1", label: "ゾーン1", combinations: ["P1", "PV"] },
  { code: "ゾーン2", label: "ゾーン2", combinations: ["P2", "PB", "PW"] },
  { code: "ゾーン3", label: "ゾーン3", combinations: ["PA", "PX", "P3", "P8"] },
  { code: "ゾーン4", label: "ゾーン4", combinations: ["PC", "PY", "P4"] },
  { code: "ゾーン5", label: "ゾーン5", combinations: ["P5", "PZ", "P9"] },
] as const;

const BLOCK_ZONE_BY_COMBINATION = BLOCK_ZONE_DISPLAYS.reduce<
  Record<string, { code: string; label: string }>
>((zones, zone) => {
  zone.combinations.forEach((combination) => {
    zones[combination] = { code: zone.code, label: zone.label };
  });
  return zones;
}, {});

function getBlockZoneDisplay(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  return (
    BLOCK_ZONE_BY_COMBINATION[normalizedCode] ?? {
      code: "その他",
      label: "その他",
    }
  );
}

function getBlockZoneOrder(label: string) {
  const index = BLOCK_ZONE_DISPLAYS.findIndex((zone) => zone.label === label);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index + 1;
}

function normalizePlayerNumber(value: number | string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return String(value).trim().replace(/^0+/, "") || "0";
}

function getFreeballReceiverPlay(
  event: ParsedEvent,
  side: TeamSide,
  triggerIndex: number,
) {
  const teamCode = getTeamCode(side);
  const triggerPlay = event.plays[triggerIndex];

  if (triggerPlay?.team === teamCode && isOverpassDig(triggerPlay)) {
    return triggerPlay;
  }

  return event.plays
    .slice(triggerIndex + 1)
    .find(
      (candidate) =>
        candidate.team === teamCode &&
        (candidate.skill === "R" ||
          candidate.skill === "D" ||
          candidate.skill === "F"),
    );
}

function didSetterReceiveFreeball(
  event: ParsedEvent,
  side: TeamSide,
  triggerIndex: number,
) {
  const setterAt = event.lineup[side].setterAt;
  const setterPlayer = setterAt
    ? event.lineup[side].positions[String(setterAt)]
    : undefined;
  const receiverPlay = getFreeballReceiverPlay(event, side, triggerIndex);

  return (
    normalizePlayerNumber(receiverPlay?.player) !== undefined &&
    normalizePlayerNumber(receiverPlay?.player) === normalizePlayerNumber(setterPlayer)
  );
}

function isFreeballTriggerForSide(
  plays: ParsedPlay[],
  index: number,
  side: TeamSide,
) {
  const teamCode = getTeamCode(side);
  const opponentCode = side === "home" ? "a" : "*";
  const play = plays[index];

  if (play.team === opponentCode && play.skill === "F") {
    return true;
  }

  if (
    play.team === opponentCode &&
    (play.skill === "R" || play.skill === "D") &&
    isGradeF(play)
  ) {
    return true;
  }

  if (play.team === teamCode && isOverpassDig(play)) {
    const previousOpponentAttack = [...plays.slice(0, index)]
      .reverse()
      .find((candidate) => candidate.team === opponentCode && candidate.skill !== "B");
    return previousOpponentAttack ? isOverpassAttack(previousOpponentAttack) : false;
  }

  return false;
}

export function buildFreeballAttackDistribution(
  match: ParsedMatch | undefined,
  side: TeamSide,
): FreeballAttackRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  const rows = new Map<
    string,
    { code: string; label: string; count: number; setterReceivedCount: number; kills: number }
  >();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      event.plays.forEach((_play, index) => {
        if (!isFreeballTriggerForSide(event.plays, index, side)) {
          return;
        }

        const attackPlay = event.plays
          .slice(index + 1)
          .find((candidate) => candidate.team === teamCode && candidate.skill === "A");
        if (!attackPlay) {
          return;
        }

        const display = getFreeballAttackDisplay(getAttackCombinationLabel(attackPlay));
        const current = rows.get(display.label) ?? {
          ...display,
          count: 0,
          setterReceivedCount: 0,
          kills: 0,
        };
        current.count += 1;
        if (isKill(attackPlay)) {
          current.kills += 1;
        }
        if (didSetterReceiveFreeball(event, side, index)) {
          current.setterReceivedCount += 1;
        }
        rows.set(display.label, current);
      });
    });
  });

  const total = [...rows.values()].reduce((sum, row) => sum + row.count, 0);
  return [...rows.values()]
    .map((row) => ({ ...row, total }))
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

function createBlockPlayerRow(player: string): BlockPlayerRow {
  return {
    player,
    setAppearances: 0,
    successes: 0,
    misses: 0,
  };
}

function getLineupPlayerKeys(event: ParsedEvent, side: TeamSide) {
  return Object.values(event.lineup[side].positions)
    .map((player) => normalizePlayerNumber(player))
    .filter((player): player is string => player !== undefined);
}

export function buildBlockPlayerRows(
  match: ParsedMatch | undefined,
  side: TeamSide,
): BlockPlayerRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  const rows = new Map<string, BlockPlayerRow>();

  match.sets.forEach((set) => {
    const setPlayers = new Set<string>();

    set.events.forEach((event) => {
      getLineupPlayerKeys(event, side).forEach((player) => {
        setPlayers.add(player);
        if (!rows.has(player)) {
          rows.set(player, createBlockPlayerRow(player));
        }
      });

      event.plays
        .filter((play) => play.team === teamCode && play.skill === "B")
        .forEach((play) => {
          const player = getPlayerKey(play);
          setPlayers.add(player);
          const row = rows.get(player) ?? createBlockPlayerRow(player);
          if (isKill(play)) {
            row.successes += 1;
          }
          if (isError(play)) {
            row.misses += 1;
          }
          rows.set(player, row);
        });
    });

    setPlayers.forEach((player) => {
      const row = rows.get(player) ?? createBlockPlayerRow(player);
      row.setAppearances += 1;
      rows.set(player, row);
    });
  });

  return [...rows.values()].sort((left, right) =>
    left.player.localeCompare(right.player, "ja", { numeric: true }),
  );
}

function findPreviousOpponentAttack(
  plays: ParsedPlay[],
  blockIndex: number,
  opponentCode: string,
) {
  return [...plays.slice(0, blockIndex)]
    .reverse()
    .find((play) => play.team === opponentCode && play.skill === "A");
}

function buildBlockAttackRows(
  match: ParsedMatch | undefined,
  side: TeamSide,
  effect: "#" | "=",
): BlockAttackRow[] {
  if (!match) {
    return [];
  }

  const teamCode = getTeamCode(side);
  const opponentCode = side === "home" ? "a" : "*";
  const rows = new Map<
    string,
    { code: string; label: string; count: number; opponentAttackCount: number }
  >();

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      event.plays.forEach((play, index) => {
        if (play.team === opponentCode && play.skill === "A") {
          const display = getBlockZoneDisplay(getAttackCombinationLabel(play));
          const current = rows.get(display.label) ?? {
            ...display,
            count: 0,
            opponentAttackCount: 0,
          };
          current.opponentAttackCount += 1;
          rows.set(display.label, current);
        }

        if (play.team !== teamCode || play.skill !== "B" || play.effect !== effect) {
          return;
        }

        const attack = findPreviousOpponentAttack(event.plays, index, opponentCode);
        const display = getBlockZoneDisplay(
          attack ? getAttackCombinationLabel(attack) : "不明",
        );
        const current = rows.get(display.label) ?? {
          ...display,
          count: 0,
          opponentAttackCount: 0,
        };
        current.count += 1;
        rows.set(display.label, current);
      });
    });
  });

  const total = [...rows.values()].reduce((sum, row) => sum + row.count, 0);
  return [...rows.values()]
    .map((row) => ({ ...row, total }))
    .sort((left, right) => {
      const leftOrder = getBlockZoneOrder(left.label);
      const rightOrder = getBlockZoneOrder(right.label);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      if (right.opponentAttackCount !== left.opponentAttackCount) {
        return right.opponentAttackCount - left.opponentAttackCount;
      }
      return right.count - left.count;
    });
}

export function buildBlockSuccessRows(match: ParsedMatch | undefined, side: TeamSide) {
  return buildBlockAttackRows(match, side, "#");
}

export function buildBlockMissRows(match: ParsedMatch | undefined, side: TeamSide) {
  return buildBlockAttackRows(match, side, "=");
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

export function mergeFreeballAttackRows(rows: FreeballAttackRow[][]): FreeballAttackRow[] {
  const counts = new Map<
    string,
    { code: string; label: string; count: number; setterReceivedCount: number; kills: number }
  >();
  rows.flat().forEach((row) => {
    const current = counts.get(row.label) ?? {
      code: row.code,
      label: row.label,
      count: 0,
      setterReceivedCount: 0,
      kills: 0,
    };
    current.count += row.count;
    current.setterReceivedCount += row.setterReceivedCount;
    current.kills += row.kills;
    counts.set(row.label, current);
  });
  const total = [...counts.values()].reduce((sum, row) => sum + row.count, 0);
  return [...counts.values()]
    .map((row) => ({ ...row, total }))
    .sort((left, right) => right.count - left.count);
}

export function mergeBlockAttackRows(rows: BlockAttackRow[][]): BlockAttackRow[] {
  const counts = new Map<
    string,
    { code: string; label: string; count: number; opponentAttackCount: number }
  >();
  rows.flat().forEach((row) => {
    const current = counts.get(row.label) ?? {
      code: row.code,
      label: row.label,
      count: 0,
      opponentAttackCount: 0,
    };
    current.count += row.count;
    current.opponentAttackCount += row.opponentAttackCount;
    counts.set(row.label, current);
  });
  const total = [...counts.values()].reduce((sum, row) => sum + row.count, 0);
  return [...counts.values()]
    .map((row) => ({ ...row, total }))
    .sort((left, right) => {
      const leftOrder = getBlockZoneOrder(left.label);
      const rightOrder = getBlockZoneOrder(right.label);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      if (right.opponentAttackCount !== left.opponentAttackCount) {
        return right.opponentAttackCount - left.opponentAttackCount;
      }
      return right.count - left.count;
    });
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

export function mergeBlockPlayerRows(rows: BlockPlayerRow[][]): BlockPlayerRow[] {
  const merged = new Map<string, BlockPlayerRow>();
  rows.flat().forEach((row) => {
    const current = merged.get(row.player) ?? createBlockPlayerRow(row.player);
    current.setAppearances += row.setAppearances;
    current.successes += row.successes;
    current.misses += row.misses;
    merged.set(row.player, current);
  });

  return [...merged.values()].sort((left, right) =>
    left.player.localeCompare(right.player, "ja", { numeric: true }),
  );
}

function getPlayerDisplayName(player: MatchPlayer) {
  const explicitName = normalizeNameWhitespace(player.name);
  const joinedName = [player.lastName, player.firstName]
    .map((name) => normalizeNameWhitespace(name))
    .filter(Boolean)
    .join(" ");

  return explicitName || joinedName || undefined;
}

function normalizeNameWhitespace(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") || undefined;
}

function getPlayerNumberKeys(player: MatchPlayer) {
  return [normalizePlayerNumber(player.code), normalizePlayerNumber(player.shirtNumber)].filter(
    (value): value is string => value !== undefined,
  );
}

function getAnalysisInputDateKey(input: AnalysisMatchInput, fallbackIndex: number) {
  return (
    input.match.startDate ??
    input.match.createdAt ??
    String(fallbackIndex).padStart(8, "0")
  );
}

function buildPlayerDisplayNameMap(inputs: AnalysisMatchInput[]) {
  const names = new Map<string, string>();

  [...inputs]
    .map((input, index) => ({ input, index }))
    .sort((left, right) =>
      getAnalysisInputDateKey(left.input, left.index).localeCompare(
        getAnalysisInputDateKey(right.input, right.index),
      ),
    )
    .forEach(({ input }) => {
      const players = input.match.teams[input.ownSide].players ?? [];
      players.forEach((player) => {
        const name = getPlayerDisplayName(player);
        if (!name) {
          return;
        }

        getPlayerNumberKeys(player).forEach((key) => {
          if (!names.has(key)) {
            names.set(key, `${key} ${name}`);
          }
        });
      });
    });

  return names;
}

function getDisplayPlayerLabel(label: string, playerNames: Map<string, string>) {
  if (label === "チーム全体") {
    return label;
  }

  const key = normalizePlayerNumber(label);
  return key ? playerNames.get(key) ?? key : label;
}

function applyPlayerNamesToLabelRows<T extends { label: string }>(
  rows: T[],
  playerNames: Map<string, string>,
): T[] {
  return rows.map((row) => ({
    ...row,
    label: getDisplayPlayerLabel(row.label, playerNames),
  }));
}

function applyPlayerNamesToPlayerRows<T extends { player: string }>(
  rows: T[],
  playerNames: Map<string, string>,
): T[] {
  return rows.map((row) => ({
    ...row,
    player: getDisplayPlayerLabel(row.player, playerNames),
  }));
}

function mergeDisplayedBlockPlayerRows(rows: BlockPlayerRow[]): BlockPlayerRow[] {
  const merged = new Map<string, BlockPlayerRow>();
  rows.forEach((row) => {
    const current = merged.get(row.player) ?? createBlockPlayerRow(row.player);
    current.setAppearances += row.setAppearances;
    current.successes += row.successes;
    current.misses += row.misses;
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
  const opponentPlays = scopedInputs.flatMap((input) =>
    getTeamPlays(input.match, input.ownSide === "home" ? "away" : "home"),
  );
  const playerNames = buildPlayerDisplayNameMap(scopedInputs);
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
    rotations: mergeRotationRows(
      scopedInputs.map((input) => buildRotationRows(input.match.sets, input.ownSide)),
    ),
    players: applyPlayerNamesToPlayerRows(buildPlayerRows(teamPlays), playerNames),
  };
  const opponentAnalysis: TeamAnalysis = {
    side: "away",
    name: "相手チーム合計",
    rallyCount: 0,
    wonRallies: 0,
    sideoutAttempts: 0,
    sideoutWins: 0,
    breakAttempts: 0,
    breakWins: 0,
    skillSummary: buildSkillSummary(opponentPlays),
    rotations: [],
    players: buildPlayerRows(opponentPlays),
  };

  const matchSummaries = scopedInputs.map<MatchSummaryRow>((input) => {
    const analysis = buildTeamAnalysis(input.match, input.ownSide);
    const opponentSide = input.ownSide === "home" ? "away" : "home";
    const opponentAnalysisForMatch = buildTeamAnalysis(input.match, opponentSide);
    if (analysis) {
      totalAnalysis.rallyCount += analysis.rallyCount;
      totalAnalysis.wonRallies += analysis.wonRallies;
      totalAnalysis.sideoutAttempts += analysis.sideoutAttempts;
      totalAnalysis.sideoutWins += analysis.sideoutWins;
      totalAnalysis.breakAttempts += analysis.breakAttempts;
      totalAnalysis.breakWins += analysis.breakWins;
    }
    if (opponentAnalysisForMatch) {
      opponentAnalysis.rallyCount += opponentAnalysisForMatch.rallyCount;
      opponentAnalysis.wonRallies += opponentAnalysisForMatch.wonRallies;
      opponentAnalysis.sideoutAttempts += opponentAnalysisForMatch.sideoutAttempts;
      opponentAnalysis.sideoutWins += opponentAnalysisForMatch.sideoutWins;
      opponentAnalysis.breakAttempts += opponentAnalysisForMatch.breakAttempts;
      opponentAnalysis.breakWins += opponentAnalysisForMatch.breakWins;
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
    opponentAnalysis,
    teamPlays,
    opponentPlays,
    matchSummaries,
    rotationPointCauseRows: mergeRotationPointCauseRows(
      scopedInputs.map((input) =>
        buildRotationPointCauseRows(input.match, input.ownSide),
      ),
    ),
    attackMetricRows: applyPlayerNamesToLabelRows(
      buildAttackMetricRows(teamPlays),
      playerNames,
    ),
    serveMetricRows: applyPlayerNamesToLabelRows(
      buildServeMetricRows(teamPlays),
      playerNames,
    ),
    receptionMetricRows: applyPlayerNamesToLabelRows(
      buildReceptionMetricRows(teamPlays),
      playerNames,
    ),
    freeballAttackRows: mergeFreeballAttackRows(
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
    blockPlayerRows: mergeDisplayedBlockPlayerRows(
      applyPlayerNamesToPlayerRows(
        mergeBlockPlayerRows(
          scopedInputs.map((input) => buildBlockPlayerRows(input.match, input.ownSide)),
        ),
        playerNames,
      ),
    ),
    blockSuccessRows: mergeBlockAttackRows(
      scopedInputs.map((input) => buildBlockSuccessRows(input.match, input.ownSide)),
    ),
    blockMissRows: mergeBlockAttackRows(
      scopedInputs.map((input) => buildBlockMissRows(input.match, input.ownSide)),
    ),
    attackCourseRows: applyPlayerNamesToPlayerRows(
      buildAttackCourseRows(teamPlays),
      playerNames,
    ),
    serveBreakRows: applyPlayerNamesToPlayerRows(
      mergeServeBreakRows(
        scopedInputs.map((input) => buildServeBreakRows(input.match, input.ownSide)),
      ),
      playerNames,
    ),
  };
}
