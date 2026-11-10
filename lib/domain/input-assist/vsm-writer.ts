// 打ち込み補助のセッションから、VSM(バレーステーションの試合ファイル、JSON)を作る。
// 途中まででも書き出せる:サーブの向きが決まっていないラリーと、ラリーでないものは入れない。

import { computeSet, teamCode, type IaRallyResult } from "@/lib/domain/input-assist/engine";
import { createObjectId, type IdFactory } from "@/lib/domain/input-assist/ids";
import type {
  IaLineup,
  IaPlay,
  IaRally,
  IaSet,
  IaTeamCode,
  IaTeamSide,
  InputAssistSession,
} from "@/lib/domain/input-assist/types";

const VSM_TIME_SCALE = 10;

type VsmLineup = { positions: Record<string, number | null>; setterAt: number };
type VsmPlay = Record<string, unknown>;
type VsmEvent = Record<string, unknown>;

export type BuildVsmOptions = {
  /** 書き出した時刻(createdAt)。テストで固定するため。 */
  now?: Date;
  idFactory?: IdFactory;
  /** scout.video.path。空だとバレーステーションが読まないので、なければファイル名を作る。 */
  videoPath?: string;
};

export function toVsmTime(seconds: number): number {
  return Math.round(seconds * VSM_TIME_SCALE);
}

function toVsmLineup(lineup: IaLineup): VsmLineup {
  return { positions: { ...lineup.positions }, setterAt: lineup.setterAt };
}

function toVsmLineups(lineup: Record<IaTeamSide, IaLineup>) {
  return { home: toVsmLineup(lineup.home), away: toVsmLineup(lineup.away) };
}

function playCode(team: IaTeamCode, player: number, skill: string, effect?: string): string {
  return `${team === "a" ? "a" : ""}${player}${skill}${effect && effect !== "-" ? effect : ""}`;
}

export function buildServePlay(
  team: IaTeamCode,
  player: number | null,
  serveTime: number,
  newId: IdFactory,
): VsmPlay {
  const time = toVsmTime(serveTime);
  const number = player ?? 0;
  return {
    _id: newId(),
    team,
    player: String(number).padStart(2, "0"),
    skill: "S",
    hitType: "M",
    effect: "-",
    code: playCode(team, number, "S"),
    time,
    originalTime: time,
  };
}

function toVsmPlay(play: IaPlay, fallbackTime: number, newId: IdFactory): VsmPlay {
  const time = toVsmTime(play.time ?? fallbackTime);
  const output: VsmPlay = {
    _id: play.id || newId(),
    team: play.team,
    player: String(play.player).padStart(2, "0"),
    skill: play.skill,
    hitType: play.hitType ?? "M",
    effect: play.effect ?? "-",
    code: play.code ?? playCode(play.team, play.player, play.skill, play.effect),
    time,
    originalTime: time,
  };
  if (typeof play.startZone === "number") {
    output.startZone = play.startZone;
  }
  if (typeof play.endZone === "number") {
    output.endZone = play.endZone;
  }
  return output;
}

function buildRallyPlays(rally: IaRally, result: IaRallyResult, newId: IdFactory): VsmPlay[] {
  // 入れたプレーは入れた順のまま。サーブがなければ、サーバーのサーブを先頭に足す。
  const entered = rally.plays ?? [];
  const plays = entered.map((play) => toVsmPlay(play, rally.serveTime, newId));
  if (!entered.some((play) => play.skill === "S")) {
    plays.unshift(buildServePlay(teamCode(result.servingTeam), result.server, rally.serveTime, newId));
  }
  return plays;
}

export function buildVsmSet(set: IaSet, newId: IdFactory = createObjectId): Record<string, unknown> {
  const result = computeSet(set);
  const ralliesById = new Map(set.rallies.map((rally) => [rally.id, rally]));
  const events: VsmEvent[] = result.timeline.map((entry) => {
    if (entry.kind === "substitution") {
      return {
        _id: entry.substitution.id || newId(),
        lineup: toVsmLineups(entry.lineup),
        score: { ...entry.score },
        substitution: {
          playerIn: entry.substitution.playerIn,
          playerOut: entry.substitution.playerOut,
          team: teamCode(entry.substitution.team),
        },
      };
    }
    const rally = ralliesById.get(entry.result.rallyId) as IaRally;
    return {
      _id: rally.id || newId(),
      lineup: toVsmLineups(entry.result.lineup),
      exchange: {
        plays: buildRallyPlays(rally, entry.result, newId),
        point: teamCode(entry.result.pointWinner),
      },
      score: { ...entry.result.scoreAfter },
    };
  });

  return {
    _id: newId(),
    startingLineup: toVsmLineups(set.startingLineup),
    events,
    score: { ...result.score },
  };
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

/** 書き出すファイルの名前(scout.video.path にも使う)。 */
export function buildVsmBaseName(session: Pick<InputAssistSession, "date" | "opponent" | "title">): string {
  const label = (session.opponent || session.title || "試合").replace(/[\\/:*?"<>|\s]+/g, "_");
  return `${compactDate(session.date) || "00000000"}_${label}`;
}

export function buildVsmFileName(session: Pick<InputAssistSession, "date" | "opponent" | "title">): string {
  return `${buildVsmBaseName(session)}.vsm`;
}

export function buildVsm(session: InputAssistSession, options: BuildVsmOptions = {}): Record<string, unknown> {
  const newId = options.idFactory ?? createObjectId;
  const now = options.now ?? new Date();
  const videoPath = options.videoPath?.trim() || `${buildVsmBaseName(session)}.mp4`;
  const sets = [...session.sets].sort((left, right) => left.setIndex - right.setIndex);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(session.date)
    ? new Date(`${session.date}T00:00:00.000+09:00`).toISOString()
    : now.toISOString();

  return {
    gameType: session.extras.gameType ?? "indoor",
    version: 1,
    startDate,
    scout: {
      sets: sets.map((set) => buildVsmSet(set, newId)),
      video: { path: videoPath },
    },
    team: {
      home: session.teams.home,
      away: session.teams.away,
    },
    attackCombinations: session.extras.attackCombinations ?? [],
    setterCalls: session.extras.setterCalls ?? [],
    spectators: null,
    createdAt: now.toISOString(),
  };
}

export function buildVsmText(session: InputAssistSession, options?: BuildVsmOptions): string {
  return JSON.stringify(buildVsm(session, options));
}
