// 打ち込み補助のセッションから、VSM(バレーステーションの試合ファイル、JSON)を作る。
// 田中の書き方に合わせる(02_Projects/スカウティングAI/設計_VSMの書き方.md)。
// 途中まででも書き出せる:サーブの向きが決まっていないラリーと、ラリーでないものは入れない。

import { computeSet, teamCode, type IaRallyResult } from "@/lib/domain/input-assist/engine";
import { createObjectId, type IdFactory } from "@/lib/domain/input-assist/ids";
import { buildPlayCode } from "@/lib/domain/input-assist/play-code";
import { emptyStaff } from "@/lib/domain/input-assist/session";
import type {
  IaLineup,
  IaPlay,
  IaRally,
  IaSet,
  IaTeam,
  IaTeamCode,
  IaTeamSide,
  InputAssistSession,
} from "@/lib/domain/input-assist/types";
import { DEFAULT_ATTACK_COMBINATIONS, DEFAULT_SETTER_CALLS } from "@/lib/domain/input-assist/vsm-defaults";

const VSM_TIME_SCALE = 10;

type VsmLineup = { positions: Record<string, number | null>; setterAt: number };
type VsmPlay = Record<string, unknown>;
type VsmEvent = Record<string, unknown>;

export type BuildVsmOptions = {
  /** 書き出した時刻(createdAt)。テストで固定するため。 */
  now?: Date;
  idFactory?: IdFactory;
  /** scout.video.path。なければセッションの videoPath、それもなければ日付と相手から作る。 */
  videoPath?: string;
};

/** 動画の秒 → VSM の time(10 倍の整数)。originalTime も同じ値にする。 */
export function toVsmTime(seconds: number): number {
  return Math.round(seconds * VSM_TIME_SCALE);
}

function toVsmLineup(lineup: IaLineup): VsmLineup {
  return { positions: { ...lineup.positions }, setterAt: lineup.setterAt };
}

function toVsmLineups(lineup: Record<IaTeamSide, IaLineup>) {
  return { home: toVsmLineup(lineup.home), away: toVsmLineup(lineup.away) };
}

function twoDigits(player: number | null): string {
  return String(player ?? 0).padStart(2, "0");
}

/** 骨組みだけのラリーのサーブ(種類 M・評価 -。code は `a2SM.` の形)。 */
export function buildServePlay(
  team: IaTeamCode,
  player: number | null,
  serveTime: number,
  newId: IdFactory,
): VsmPlay {
  const time = toVsmTime(serveTime);
  return {
    _id: newId(),
    team,
    player: twoDigits(player),
    skill: "S",
    hitType: "M",
    effect: "-",
    code: buildPlayCode({ team, player: player ?? 0, skill: "S", hitType: "M", effect: "-" }),
    time,
    originalTime: time,
  };
}

/** 田中の書き方の欄の順で並べる(ない欄は書かない)。 */
function toVsmPlay(play: IaPlay, previous: IaPlay | undefined, fallbackTime: number): VsmPlay {
  const time = toVsmTime(play.time ?? fallbackTime);
  const output: VsmPlay = {
    _id: play.id,
    team: play.team,
    player: twoDigits(play.player),
    skill: play.skill,
    hitType: play.hitType ?? "M",
    effect: play.effect ?? "-",
  };
  const optional: Array<[string, unknown]> = [
    ["combination", play.combination],
    ["startZone", play.startZone],
    ["startSubZone", play.startSubZone],
    ["endZone", play.endZone],
    ["endSubZone", play.endSubZone],
    ["targetAttacker", play.targetAttacker],
    ["skillType", play.skillType],
    ["players", play.players],
    ["special", play.special],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  Object.assign(output, play.extra ?? {});
  output.code = play.code ?? buildPlayCode(play, previous);
  output.time = time;
  output.originalTime = time;
  return output;
}

function buildRallyPlays(rally: IaRally, result: IaRallyResult, newId: IdFactory): VsmPlay[] {
  // 入れたプレーは入れた順のまま。サーブがなければ、サーバーのサーブを先頭に足す。
  const entered = rally.plays ?? [];
  const plays = entered.map((play, index) => toVsmPlay(play, entered[index - 1], rally.serveTime));
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
    if (entry.kind === "timeout") {
      return {
        _id: entry.timeout.id || newId(),
        lineup: toVsmLineups(entry.lineup),
        score: { ...entry.score },
        timeout: { team: teamCode(entry.timeout.team) },
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

/** 書き出すファイルの名前の元(日付_相手)。 */
export function buildVsmBaseName(session: Pick<InputAssistSession, "date" | "opponent" | "title">): string {
  const label = (session.opponent || session.title || "試合").replace(/[\\/:*?"<>|\s]+/g, "_");
  return `${compactDate(session.date) || "00000000"}_${label}`;
}

export function buildVsmFileName(session: Pick<InputAssistSession, "date" | "opponent" | "title">): string {
  return `${buildVsmBaseName(session)}.vsm`;
}

/** scout.video.path(空だとバレーステーションが読まないので、必ず入れる)。 */
export function resolveVideoPath(
  session: Pick<InputAssistSession, "date" | "opponent" | "title" | "videoPath">,
  override?: string,
): string {
  return override?.trim() || session.videoPath?.trim() || `${buildVsmBaseName(session)}.mp4`;
}

/** チームは読み込んだものをそのまま。読み込んでいないときも、田中の書き方の欄はそろえる。 */
function toVsmTeam(team: IaTeam): IaTeam {
  return {
    ...team,
    libero: team.libero ?? [],
    staff: team.staff ?? emptyStaff(),
  };
}

export function buildVsm(session: InputAssistSession, options: BuildVsmOptions = {}): Record<string, unknown> {
  const newId = options.idFactory ?? createObjectId;
  const now = options.now ?? new Date();
  // 「このセットは打たない」の印が付いたセットは書き出さない
  const sets = [...session.sets].filter((set) => !set.skipped).sort((left, right) => left.setIndex - right.setIndex);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(session.date)
    ? new Date(`${session.date}T00:00:00.000+09:00`).toISOString()
    : now.toISOString();

  return {
    gameType: session.extras.gameType ?? "indoor",
    version: 1,
    startDate,
    scout: {
      sets: sets.map((set) => buildVsmSet(set, newId)),
      video: { path: resolveVideoPath(session, options.videoPath) },
    },
    team: {
      home: toVsmTeam(session.teams.home),
      away: toVsmTeam(session.teams.away),
    },
    // 攻撃コンビ・セッターコールは、読み込んだ名簿のものではなく、いつも昨シーズンの手直し版を使う(vsm-defaults.ts)
    attackCombinations: DEFAULT_ATTACK_COMBINATIONS,
    setterCalls: DEFAULT_SETTER_CALLS,
    spectators: null,
    createdAt: now.toISOString(),
  };
}

export function buildVsmText(session: InputAssistSession, options?: BuildVsmOptions): string {
  return JSON.stringify(buildVsm(session, options));
}
