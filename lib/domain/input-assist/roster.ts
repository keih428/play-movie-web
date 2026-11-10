// 名簿の読み込み:vsdb(シーズンのデータ)か vsm(1試合)から、チームと選手を取り出す。
// 取り出したチームはそのまま持ち、VSM を書き出すときにそのまま戻す。

import { teamFromCode } from "@/lib/domain/input-assist/engine";
import { createObjectId } from "@/lib/domain/input-assist/ids";
import { normalizeTeam, roundTime } from "@/lib/domain/input-assist/session";
import {
  IA_POSITIONS,
  type IaLineup,
  type IaMatchExtras,
  type IaPlay,
  type IaRally,
  type IaSet,
  type IaSubstitution,
  type IaTeam,
  type IaTeamSide,
} from "@/lib/domain/input-assist/types";

export type ScoutMatchChoice = {
  index: number;
  label: string;
  startDate?: string;
  teams: Record<IaTeamSide, IaTeam>;
  extras: IaMatchExtras;
  /** ファイルにあるセットごとのスタメンと最終スコア(あれば)。 */
  sets: Array<{
    setIndex: number;
    startingLineup?: Record<IaTeamSide, IaLineup>;
    finalScore?: { home: number; away: number };
  }>;
  raw: Record<string, unknown>;
};

export type ScoutRosterFile = {
  kind: "vsm" | "vsdb";
  matches: ScoutMatchChoice[];
  /** vsdb の teams(試合のないチームも選べるように)。 */
  teams: IaTeam[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readLineup(value: unknown): IaLineup | undefined {
  const input = asRecord(value);
  const positionsInput = asRecord(input.positions);
  if (Object.keys(positionsInput).length === 0) {
    return undefined;
  }
  const positions = {} as IaLineup["positions"];
  for (const position of IA_POSITIONS) {
    const number = Number(positionsInput[position]);
    positions[position] = Number.isFinite(number) && positionsInput[position] !== null ? number : null;
  }
  const setterAt = Number(input.setterAt);
  return { positions, setterAt: setterAt >= 1 && setterAt <= 6 ? setterAt : 1 };
}

function readMatch(raw: Record<string, unknown>, index: number): ScoutMatchChoice {
  const team = asRecord(raw.team);
  const teams = {
    home: normalizeTeam(team.home, "ホーム"),
    away: normalizeTeam(team.away, "アウェイ"),
  };
  const scout = asRecord(raw.scout);
  const sets = Array.isArray(scout.sets) ? scout.sets : [];
  const startDate = typeof raw.startDate === "string" ? raw.startDate : undefined;
  return {
    index,
    label: `${startDate ? `${startDate.slice(0, 10)} ` : ""}${teams.home.name} vs ${teams.away.name}`,
    startDate,
    teams,
    extras: {
      gameType: typeof raw.gameType === "string" ? raw.gameType : undefined,
      attackCombinations: Array.isArray(raw.attackCombinations) ? raw.attackCombinations : undefined,
      setterCalls: Array.isArray(raw.setterCalls) ? raw.setterCalls : undefined,
    },
    sets: sets.map((entry, setIndex) => {
      const set = asRecord(entry);
      const lineup = asRecord(set.startingLineup);
      const home = readLineup(lineup.home);
      const away = readLineup(lineup.away);
      const score = asRecord(set.score);
      const hasScore = typeof score.home === "number" && typeof score.away === "number";
      return {
        setIndex: setIndex + 1,
        startingLineup: home && away ? { home, away } : undefined,
        finalScore: hasScore ? { home: score.home as number, away: score.away as number } : undefined,
      };
    }),
    raw,
  };
}

export function readScoutRosterFile(text: string, fileName: string): ScoutRosterFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("ファイルを読めませんでした(JSON ではありません)。");
  }
  const input = asRecord(raw);
  const isVsdb = fileName.toLowerCase().endsWith(".vsdb") || Array.isArray(input.matches);
  if (isVsdb) {
    const matches = (Array.isArray(input.matches) ? input.matches : []).map((match, index) =>
      readMatch(asRecord(match), index),
    );
    const teams = (Array.isArray(input.teams) ? input.teams : []).map((team, index) =>
      normalizeTeam(team, `チーム${index + 1}`),
    );
    return { kind: "vsdb", matches, teams };
  }
  const match = readMatch(input, 0);
  return { kind: "vsm", matches: [match], teams: [match.teams.home, match.teams.away] };
}

// ---- VSM のラリーを、打ち込み補助のセットに読み込む(書き出したものを開き直す・検証に使う) ----

const VSM_TIME_SCALE = 10;

function readPlay(value: unknown): IaPlay | null {
  const play = asRecord(value);
  const player = Number(play.player);
  const skill = typeof play.skill === "string" ? play.skill : "";
  if (!Number.isFinite(player) || !["S", "R", "E", "A", "B", "D", "F"].includes(skill)) {
    return null;
  }
  return {
    id: typeof play._id === "string" ? play._id : createObjectId(),
    team: play.team === "a" ? "a" : "*",
    player,
    skill: skill as IaPlay["skill"],
    hitType: typeof play.hitType === "string" ? play.hitType : undefined,
    effect: typeof play.effect === "string" ? play.effect : undefined,
    time: typeof play.time === "number" ? play.time / VSM_TIME_SCALE : undefined,
    startZone: typeof play.startZone === "number" ? play.startZone : undefined,
    endZone: typeof play.endZone === "number" ? play.endZone : undefined,
    code: typeof play.code === "string" ? play.code : undefined,
  };
}

/**
 * VSM の1試合から、セット(スタメン・最終スコア・ラリー・交代)を作る。手前はホームとみなす。
 * ラリーの時刻はサーブのプレーの time。交代の時刻は、前後のラリーの間にする。
 */
export function setsFromVsmMatch(raw: Record<string, unknown>): IaSet[] {
  const scout = asRecord(raw.scout);
  const sets = Array.isArray(scout.sets) ? scout.sets : [];
  return sets.map((entry, index) => {
    const set = asRecord(entry);
    const lineup = asRecord(set.startingLineup);
    const score = asRecord(set.score);
    const events = Array.isArray(set.events) ? set.events.map(asRecord) : [];
    const rallies: IaRally[] = [];
    const pendingSubstitutions: Array<Omit<IaSubstitution, "time">> = [];
    const substitutions: IaSubstitution[] = [];

    for (const event of events) {
      const substitution = asRecord(event.substitution);
      if (event.substitution) {
        pendingSubstitutions.push({
          id: typeof event._id === "string" ? event._id : createObjectId(),
          team: teamFromCode(String(substitution.team)),
          playerIn: Number(substitution.playerIn),
          playerOut: Number(substitution.playerOut),
        });
        continue;
      }
      const exchange = asRecord(event.exchange);
      if (!event.exchange) {
        continue;
      }
      const plays = (Array.isArray(exchange.plays) ? exchange.plays : [])
        .map(readPlay)
        .filter((play): play is IaPlay => play !== null);
      const serve = plays.find((play) => play.skill === "S");
      const previous = rallies.at(-1);
      const serveTime = serve?.time ?? (previous ? previous.serveTime + 30 : 0);
      for (const pending of pendingSubstitutions) {
        substitutions.push({ ...pending, time: roundTime(previous ? (previous.serveTime + serveTime) / 2 : serveTime - 1) });
      }
      pendingSubstitutions.length = 0;
      rallies.push({
        id: typeof event._id === "string" ? event._id : createObjectId(),
        serveTime: roundTime(serveTime),
        side: serve ? (serve.team === "*" ? "near" : "far") : null,
        status: "rally",
        source: "manual",
        checked: true,
        plays,
      });
    }
    const last = rallies.at(-1);
    for (const pending of pendingSubstitutions) {
      substitutions.push({ ...pending, time: roundTime((last?.serveTime ?? 0) + 1) });
    }

    return {
      setIndex: index + 1,
      youtubeUrl: "",
      nearTeam: "home" as const,
      startingLineup: {
        home: readLineup(lineup.home) ?? { positions: emptyPositions(), setterAt: 1 },
        away: readLineup(lineup.away) ?? { positions: emptyPositions(), setterAt: 1 },
      },
      finalScore: {
        home: typeof score.home === "number" ? score.home : null,
        away: typeof score.away === "number" ? score.away : null,
      },
      rallies,
      substitutions,
    };
  });
}

function emptyPositions(): IaLineup["positions"] {
  return { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null };
}
