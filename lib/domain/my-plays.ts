import { getEffectGrade, getSkillLabel } from "@/lib/domain/display";
import { areTeamNamesEquivalent } from "@/lib/domain/team";
import type { ParsedEvent, ParsedMatch, ParsedPlay, TeamSide, VideoSyncSettings } from "@/lib/domain/types";
import { calculateSeekSeconds } from "@/lib/domain/video";

// ---------- マイプレー(2026-10-24 から) ----------
// ログインした部員の背番号で、試合の中から自分のプレーだけを取り出す。見られるのは自分の分だけ(けーいちの決定)。
// 計画は Obsidian の「自分のプレー振り返り_改修計画」。

/** 部のチームの名前(試合データのチーム名と、TEAM_CATALOG の別名でつなぐ)。 */
const OWN_TEAM_NAME = "UTVB";

// 見方ごとの切り取り方(試合ビューアのクリップ・プレイ一覧と同じ秒数)。
export const SKILL_CLIP_BEFORE_SECONDS = 2;
export const SKILL_CLIP_AFTER_SECONDS = 5;
const RALLY_SERVE_PREROLL_SECONDS = 2;
const RALLY_TAIL_SECONDS = 3;
const VSM_TIME_SCALE = 10;

export type MyPlaysMode = "skill" | "rally";

// 絞り込みに出す順(よく見るもの順)。
export const MY_PLAY_SKILLS = ["S", "R", "A", "B", "D", "E", "F"] as const;

/** 背番号を比べられる形に("05" → "5"、" 5 " → "5")。数字でない背番号(スタッフの T など)は null。 */
export function normalizeShirtNumber(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  return String(Number(text));
}

/** 試合の中で、部のチームはホームとアウェーのどちらか。出ていなければ undefined(相手の偵察の試合など)。 */
export function findOwnSide(match: ParsedMatch): TeamSide | undefined {
  if (areTeamNamesEquivalent(match.teams.home.name, OWN_TEAM_NAME)) {
    return "home";
  }
  if (areTeamNamesEquivalent(match.teams.away.name, OWN_TEAM_NAME)) {
    return "away";
  }
  return undefined;
}

const teamCode = (side: TeamSide) => (side === "home" ? "*" : "a");

function isMyPlay(play: ParsedPlay, side: TeamSide, number: string): boolean {
  return play.team === teamCode(side) && normalizeShirtNumber(play.player) === number;
}

/** その試合で、その人が触ったプレーの数。 */
export function countMemberPlays(match: ParsedMatch, side: TeamSide, number: string): number {
  return match.sets.reduce(
    (total, set) =>
      total +
      set.events.reduce(
        (sum, event) => sum + event.plays.filter((play) => isMyPlay(play, side, number)).length,
        0,
      ),
    0,
  );
}

/** ラリーの前の点数(自チーム - 相手)と、そのラリーを取ったか。 */
function rallyScore(event: ParsedEvent, side: TeamSide): { own: number; opponent: number; won: boolean | null } {
  const homeWon = event.point === "*";
  const awayWon = event.point === "a";
  const home = homeWon ? Math.max(0, event.score.home - 1) : event.score.home;
  const away = awayWon ? Math.max(0, event.score.away - 1) : event.score.away;
  const won = homeWon || awayWon ? (side === "home" ? homeWon : awayWon) : null;
  return side === "home" ? { own: home, opponent: away, won } : { own: away, opponent: home, won };
}

function shiftTime(play: ParsedPlay, setIndex: number, seconds: number): ParsedPlay {
  return {
    ...play,
    setIndex,
    time: typeof play.time === "number" ? Math.max(0, play.time - seconds * VSM_TIME_SCALE) : play.time,
  };
}

export type MyClip = {
  key: string;
  setIndex: number;
  // ラリーの前の点数(自チーム - 相手)と、そのラリーを取ったか(分からなければ null)。
  score: { own: number; opponent: number };
  won: boolean | null;
  // その切り取りに入っている自分のプレー(スキルだけの見方なら1つ)。
  plays: { skill: string; skillLabel: string; grade: string; effect?: string }[];
  // 映像の頭出しに渡すプレー(切り取りの頭に合わせて時刻をずらしてある)。
  startPlay: ParsedPlay;
  seekSeconds: number;
  durationSeconds: number;
};

/**
 * 自分のプレーの切り取り(試合ビューアと同じ2つの見方)。
 * - skill:自分が触った瞬間の2秒前から5秒後まで(クリップと同じ)
 * - rally:自分が触ったラリーを、サーブの2秒前から最後のプレーの3秒後まで(プレイ一覧と同じ)
 * skills を渡すと、そのスキルだけに絞る(ラリーの見方では、そのスキルで触ったラリーだけ)。
 * where を渡すと、さらにその条件に合うプレーだけ(成績の数字を押したとき。決まったアタックだけ、など)。
 * 時刻のないプレー、映像のないセットのプレーは出さない。
 */
export function buildMyClips(input: {
  match: ParsedMatch;
  settings: VideoSyncSettings;
  side: TeamSide;
  number: string;
  mode: MyPlaysMode;
  skills?: string[];
  where?: (play: ParsedPlay) => boolean;
}): MyClip[] {
  const { match, settings, side, number, mode, skills, where } = input;
  const wanted = (play: ParsedPlay) =>
    isMyPlay(play, side, number) &&
    (!skills || skills.length === 0 || skills.includes(play.skill ?? "")) &&
    (!where || where(play));
  const seekOf = (play: ParsedPlay) => calculateSeekSeconds(play, settings, match);
  const describe = (play: ParsedPlay) => ({
    skill: play.skill ?? "",
    skillLabel: getSkillLabel(play.skill),
    grade: getEffectGrade(play.effect),
    effect: play.effect,
  });

  const clips: MyClip[] = [];
  for (const set of match.sets) {
    for (const event of set.events) {
      const mine = event.plays.filter(wanted);
      if (mine.length === 0) {
        continue;
      }
      const { won, ...score } = rallyScore(event, side);

      if (mode === "skill") {
        event.plays.forEach((play, index) => {
          if (!wanted(play)) {
            return;
          }
          const startPlay = shiftTime(play, set.setIndex, SKILL_CLIP_BEFORE_SECONDS);
          const seekSeconds = seekOf(startPlay);
          if (typeof seekSeconds !== "number" || typeof play.time !== "number") {
            return;
          }
          clips.push({
            key: `${set.id}-${event.id}-${play.id}-${index}`,
            setIndex: set.setIndex,
            score,
            won,
            plays: [describe(play)],
            startPlay,
            seekSeconds,
            durationSeconds: SKILL_CLIP_BEFORE_SECONDS + SKILL_CLIP_AFTER_SECONDS,
          });
        });
        continue;
      }

      const serve = event.plays.find((play) => play.skill === "S" && typeof play.time === "number");
      const timed = event.plays.filter((play) => typeof play.time === "number");
      const first = serve ?? timed[0];
      if (!first) {
        continue;
      }
      const startPlay = shiftTime(first, set.setIndex, serve ? RALLY_SERVE_PREROLL_SECONDS : 0);
      const seekSeconds = seekOf(startPlay);
      const lastSeek = Math.max(
        ...timed.map((play) => seekOf({ ...play, setIndex: set.setIndex }) ?? Number.NEGATIVE_INFINITY),
      );
      if (typeof seekSeconds !== "number" || !Number.isFinite(lastSeek)) {
        continue;
      }
      clips.push({
        key: `${set.id}-${event.id}`,
        setIndex: set.setIndex,
        score,
        won,
        plays: mine.map(describe),
        startPlay,
        seekSeconds,
        durationSeconds: Math.max(RALLY_TAIL_SECONDS, lastSeek - seekSeconds + RALLY_TAIL_SECONDS),
      });
    }
  }
  return clips;
}

/** スキルごとの、自分のプレーの数(絞り込みのボタンに出す)。 */
export function countMySkills(match: ParsedMatch, side: TeamSide, number: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const set of match.sets) {
    for (const event of set.events) {
      for (const play of event.plays) {
        if (isMyPlay(play, side, number) && play.skill) {
          counts[play.skill] = (counts[play.skill] ?? 0) + 1;
        }
      }
    }
  }
  return counts;
}

/** 試合のセットの点数(自チーム - 相手)。 */
export function getOwnSetScore(match: ParsedMatch, side: TeamSide): { own: number; opponent: number } {
  let own = 0;
  let opponent = 0;
  for (const set of match.sets) {
    const mine = side === "home" ? set.score.home : set.score.away;
    const theirs = side === "home" ? set.score.away : set.score.home;
    if (mine > theirs) {
      own += 1;
    } else if (theirs > mine) {
      opponent += 1;
    }
  }
  return { own, opponent };
}
