import type {
  MatchLineup,
  MatchPlayer,
  MatchTeam,
  ParsedCollection,
  ParsedEvent,
  ParsedMatch,
  ParsedPlay,
  ParsedSet,
  TeamSide,
} from "@/lib/domain/types";

function normalizePlayer(player: Record<string, unknown>): MatchPlayer {
  const firstName =
    typeof player.firstName === "string" ? player.firstName.trim() : undefined;
  const lastName =
    typeof player.lastName === "string" ? player.lastName.trim() : undefined;
  const explicitName =
    typeof player.name === "string" ? player.name.trim() : undefined;
  const joinedName = [lastName, firstName].filter(Boolean).join(" ");

  return {
    code: typeof player.code === "string" ? player.code : undefined,
    shirtNumber:
      typeof player.shirtNumber === "number" ? player.shirtNumber : undefined,
    firstName,
    lastName,
    name: explicitName || joinedName || undefined,
  };
}

function normalizeTeam(team: Record<string, unknown> | undefined): MatchTeam {
  return {
    code: typeof team?.code === "string" ? team.code : undefined,
    shortCode: typeof team?.shortCode === "string" ? team.shortCode : undefined,
    name: typeof team?.name === "string" ? team.name : "Unknown",
    players: Array.isArray(team?.players)
      ? team.players.map((player) =>
          normalizePlayer(player as Record<string, unknown>),
        )
      : [],
  };
}

function normalizeLineup(
  lineup: Record<string, unknown> | undefined,
): MatchLineup {
  return {
    setterAt: typeof lineup?.setterAt === "number" ? lineup.setterAt : undefined,
    positions:
      lineup?.positions && typeof lineup.positions === "object"
        ? (lineup.positions as Record<string, number | string | undefined>)
        : {},
  };
}

function normalizePlay(play: Record<string, unknown>, playIndex: number): ParsedPlay {
  return {
    id: typeof play._id === "string" ? play._id : `play-${playIndex}`,
    team: typeof play.team === "string" ? play.team : "",
    player: typeof play.player === "string" ? play.player : undefined,
    skill: typeof play.skill === "string" ? play.skill : undefined,
    hitType: typeof play.hitType === "string" ? play.hitType : undefined,
    combination:
      typeof play.combination === "string" ? play.combination : undefined,
    effect: typeof play.effect === "string" ? play.effect : undefined,
    code: typeof play.code === "string" ? play.code : undefined,
    time: typeof play.time === "number" ? play.time : undefined,
    originalTime:
      typeof play.originalTime === "number" ? play.originalTime : undefined,
    startZone: typeof play.startZone === "number" ? play.startZone : undefined,
    endZone: typeof play.endZone === "number" ? play.endZone : undefined,
    endSubZone:
      typeof play.endSubZone === "string" ? play.endSubZone : undefined,
  };
}

function normalizeEvent(
  event: Record<string, unknown>,
  eventIndex: number,
): ParsedEvent {
  const exchange =
    event.exchange && typeof event.exchange === "object"
      ? (event.exchange as Record<string, unknown>)
      : {};
  const lineup =
    event.lineup && typeof event.lineup === "object"
      ? (event.lineup as Record<TeamSide, Record<string, unknown> | undefined>)
      : { home: undefined, away: undefined };
  const score =
    event.score && typeof event.score === "object"
      ? (event.score as Record<string, unknown>)
      : {};
  const plays = Array.isArray(exchange.plays)
    ? exchange.plays.map((play, playIndex) =>
        normalizePlay(play as Record<string, unknown>, playIndex + 1),
      )
    : [];

  return {
    id: typeof event._id === "string" ? event._id : `event-${eventIndex}`,
    eventIndex,
    score: {
      home: typeof score.home === "number" ? score.home : 0,
      away: typeof score.away === "number" ? score.away : 0,
    },
    point: typeof exchange.point === "string" ? exchange.point : undefined,
    plays,
    lineup: {
      home: normalizeLineup(lineup.home),
      away: normalizeLineup(lineup.away),
    },
  };
}

function normalizeSet(setData: Record<string, unknown>, setIndex: number): ParsedSet {
  const score =
    setData.score && typeof setData.score === "object"
      ? (setData.score as Record<string, unknown>)
      : {};
  const events = Array.isArray(setData.events)
    ? setData.events.map((event, eventIndex) =>
        normalizeEvent(event as Record<string, unknown>, eventIndex + 1),
      )
    : [];

  return {
    id: typeof setData._id === "string" ? setData._id : `set-${setIndex}`,
    setIndex,
    score: {
      home: typeof score.home === "number" ? score.home : 0,
      away: typeof score.away === "number" ? score.away : 0,
    },
    events,
  };
}

export function normalizeMatch(
  input: Record<string, unknown>,
  fileName: string,
  sourceType: "vsm" | "vsdb",
  index = 0,
): ParsedMatch {
  const team =
    input.team && typeof input.team === "object"
      ? (input.team as Record<string, Record<string, unknown> | undefined>)
      : {};
  const scout =
    input.scout && typeof input.scout === "object"
      ? (input.scout as Record<string, unknown>)
      : {};
  const video =
    scout.video && typeof scout.video === "object"
      ? (scout.video as Record<string, unknown>)
      : {};
  const sets = Array.isArray(scout.sets)
    ? scout.sets.map((setData, setIndex) =>
        normalizeSet(setData as Record<string, unknown>, setIndex + 1),
      )
    : [];

  return {
    id: typeof input.createdAt === "string" ? input.createdAt : `${fileName}-${index}`,
    sourceType,
    fileName,
    startDate: typeof input.startDate === "string" ? input.startDate : undefined,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : undefined,
    gameType: typeof input.gameType === "string" ? input.gameType : undefined,
    version: typeof input.version === "number" ? input.version : undefined,
    teams: {
      home: normalizeTeam(team.home),
      away: normalizeTeam(team.away),
    },
    video: {
      path: typeof video.path === "string" ? video.path : undefined,
    },
    sets,
  };
}

export function normalizeVsm(
  input: Record<string, unknown>,
  fileName: string,
): ParsedCollection {
  return {
    sourceType: "vsm",
    matches: [normalizeMatch(input, fileName, "vsm")],
  };
}

export function normalizeVsdb(
  input: Record<string, unknown>,
  fileName: string,
): ParsedCollection {
  const season =
    input.season && typeof input.season === "object"
      ? (input.season as Record<string, unknown>)
      : {};
  const teams = Array.isArray(input.teams)
    ? input.teams.map((team) => normalizeTeam(team as Record<string, unknown>))
    : [];
  const matches = Array.isArray(input.matches)
    ? input.matches.map((match, index) =>
        normalizeMatch(match as Record<string, unknown>, fileName, "vsdb", index),
      )
    : [];

  return {
    sourceType: "vsdb",
    season: {
      name: typeof season.name === "string" ? season.name : undefined,
      startDate:
        typeof season.startDate === "string" ? season.startDate : undefined,
      endDate: typeof season.endDate === "string" ? season.endDate : undefined,
    },
    teams,
    matches,
  };
}
