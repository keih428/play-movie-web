// プレーの code(バレーステーションでキーボードから打つ短縮記号)を作る。
// 田中の書き方に合わせる(02_Projects/スカウティングAI/設計_VSMの書き方.md)。
// 完全に同じにはならない(打った順や、あとで直した跡までは再現しない)。

export type PlayCodeInput = {
  team: string;
  /** 背番号(数字か "05" のような文字)。 */
  player: number | string;
  skill: string;
  hitType?: string;
  effect?: string;
  startZone?: number;
  endZone?: number;
  endSubZone?: string;
  combination?: string;
  special?: string;
};

function shirt(player: number | string): string {
  const number = Number(player);
  return Number.isFinite(number) ? String(Math.trunc(number)) : String(player);
}

function errorMark(play: PlayCodeInput): string {
  return `=${play.special ? `,${play.special}` : ""}`;
}

/** 評価が = か / のときだけ、評価の文字を付ける。 */
function errorOrOverpass(effect: string | undefined): string {
  return effect === "=" || effect === "/" ? effect : "";
}

/**
 * @param previous 同じラリーの直前のプレー(ディグの頭の "." を決めるのに使う)
 */
export function buildPlayCode(play: PlayCodeInput, previous?: Pick<PlayCodeInput, "team">): string {
  const teamPrefix = play.team === "a" ? "a" : "";
  const number = shirt(play.player);
  const effect = play.effect ?? "";

  switch (play.skill) {
    case "S": {
      const hitType = play.hitType && play.hitType !== "H" ? play.hitType : "";
      const zones = `${play.startZone ?? ""}${play.endZone ?? ""}${play.endZone !== undefined ? (play.endSubZone ?? "") : ""}`;
      return `${teamPrefix}${number}S${hitType}${zones}${effect === "=" ? errorMark(play) : "."}`;
    }
    case "R":
      return `.${number}${effect === "+" ? "" : effect}`;
    case "E":
      if (play.combination) {
        return play.combination;
      }
      return `${teamPrefix}${number}E${errorOrOverpass(effect)}`;
    case "A": {
      const head = `${teamPrefix}${number}A${play.combination ?? ""}`;
      if (play.endZone !== undefined) {
        return `${head}${play.endZone}${play.endSubZone ?? ""}${effect === "=" ? errorMark(play) : effect}`;
      }
      return `${head}${effect === "=" ? errorMark(play) : "."}`;
    }
    case "B":
      return `.${number}${effect === "/" ? "" : effect}`;
    case "D": {
      const fromOpponent = previous !== undefined && previous.team !== play.team;
      return `${fromOpponent ? "." : teamPrefix}${number}D${errorOrOverpass(effect)}`;
    }
    case "F":
      return `${teamPrefix}${number}F${errorOrOverpass(effect)}`;
    default:
      return `${teamPrefix}${number}${play.skill}${effect}`;
  }
}
