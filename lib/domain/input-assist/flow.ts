// P1(流れ):ラリーごとに「誰が・どのスキルで・どの順で触ったか」だけを入れる。
// ここには画面から切り離した計算だけを置く(次のタッチの予想・選手の候補・サーブの同期・注意・書き出しの仮の評価)。
// 設計:02_Projects/スカウティングAI/設計_打ち込み補助v1.md の「P1 流れ」。

import { computeSet, teamCode } from "@/lib/domain/input-assist/engine";
import type {
  IaLineup,
  IaPlay,
  IaPosition,
  IaRally,
  IaSet,
  IaSkill,
  IaTeam,
  IaTeamCode,
  IaTeamSide,
} from "@/lib/domain/input-assist/types";

type FlowPlay = Pick<IaPlay, "team" | "skill">;

export const SKILL_LABELS: Record<IaSkill, string> = {
  S: "サーブ",
  R: "レセプション",
  E: "トス",
  A: "アタック",
  B: "ブロック",
  D: "ディグ",
  F: "フリーボール",
};

export function otherCode(team: IaTeamCode): IaTeamCode {
  return team === "a" ? "*" : "a";
}

export function sideOfCode(team: IaTeamCode): IaTeamSide {
  return team === "a" ? "away" : "home";
}

// ---- 次のタッチの予想 ----

/**
 * 最後に触ったチームが、今のボールで何回触ったか(ブロックは数えない)。
 * 後ろから、同じチームのタッチを数える。相手のタッチか、同じチームのブロックで止める(ブロックのあとは数え直し)。
 */
export function contactsInPossession(plays: FlowPlay[]): number {
  const last = plays.at(-1);
  if (!last || last.skill === "B") {
    return 0;
  }
  let count = 0;
  for (let index = plays.length - 1; index >= 0; index -= 1) {
    const play = plays[index];
    if (play.team !== last.team || play.skill === "B") {
      break;
    }
    count += 1;
  }
  return count;
}

export type FlowPrediction = {
  team: IaTeamCode;
  skill: IaSkill;
  /** 予想のほかによくあるスキル(A のあとの B など)。 */
  alternatives: IaSkill[];
};

/** 1チームが続けて触れるのは 3 回まで(ブロックは数えない)。 */
export const MAX_CONTACTS = 3;

/**
 * これまでのタッチから、次のタッチ(チームとスキル)を予想する。
 * S → 相手の R → 同じチームの E → A → 相手の D(B も選べる)。B → 相手の D。D・F → 同じチームの E。
 * F はそのチームの1回目のタッチ(相手からのフリーボールを受けた)なら同じチームの E、
 * 2回目以降(攻撃せずに返した)なら相手の D。3回触ったチームの次は、いつも相手。
 * @param servingTeam タッチがまだないときのサーブするチーム
 */
export function predictNextPlay(plays: FlowPlay[], servingTeam: IaTeamCode = "*"): FlowPrediction {
  const last = plays.at(-1);
  if (!last) {
    return { team: servingTeam, skill: "S", alternatives: [] };
  }
  const same = last.team;
  const other = otherCode(last.team);
  const contacts = contactsInPossession(plays);
  let prediction: FlowPrediction;
  switch (last.skill) {
    case "S":
      prediction = { team: other, skill: "R", alternatives: ["D"] };
      break;
    case "R":
      prediction = { team: same, skill: "E", alternatives: ["A"] };
      break;
    case "E":
      prediction = { team: same, skill: "A", alternatives: ["F"] };
      break;
    case "A":
      prediction = { team: other, skill: "D", alternatives: ["B"] };
      break;
    case "B":
      prediction = { team: other, skill: "D", alternatives: ["E"] };
      break;
    case "D":
      prediction = { team: same, skill: "E", alternatives: ["A"] };
      break;
    case "F":
      prediction =
        contacts <= 1
          ? { team: same, skill: "E", alternatives: ["A"] }
          : { team: other, skill: "D", alternatives: ["F"] };
      break;
  }
  if (prediction.team === last.team && contacts >= MAX_CONTACTS) {
    return { team: other, skill: "D", alternatives: ["F"] };
  }
  return prediction;
}

// ---- タッチの編集 ----

/**
 * P1 でタッチを編集する。
 * - サーブ(P0 とエンジンから決まるもの)はチームとスキルを変えない。背番号を変えたら人が決めたものにする
 * - スキルかチームが変わったら、読み込んだ code は捨てる(書き出すときに作り直す)。P2 で入れた評価は決め直す
 */
export function editFlowPlay(play: IaPlay, patch: Partial<Pick<IaPlay, "player" | "skill" | "team" | "time">>): IaPlay {
  if (play.skill === "S" && play.source !== undefined) {
    return patch.player !== undefined ? { ...play, player: patch.player, source: "manual" } : play;
  }
  const next = { ...play, ...patch };
  if (next.skill !== play.skill || next.team !== play.team) {
    delete next.code;
    if (play.effectSource !== undefined) {
      delete next.effect;
      delete next.effectSource;
    }
  }
  return next;
}

// ---- 選手の候補 ----

export type IaCandidateRow = "front" | "back" | "libero";

export type IaCandidate = {
  shirt: number;
  /** コートの位置(1〜6)。リベロは null。 */
  position: IaPosition | null;
  row: IaCandidateRow;
  isSetter: boolean;
  /** 「前衛4」「後衛1」「リベロ」。 */
  label: string;
  name?: string;
};

const FRONT_POSITIONS: IaPosition[] = ["4", "3", "2"];
const BACK_POSITIONS: IaPosition[] = ["5", "6", "1"];

function playerName(team: Pick<IaTeam, "players">, shirt: number): string | undefined {
  const player = team.players.find((entry) => entry.shirtNumber === shirt);
  const name = [player?.lastName, player?.firstName].find((value) => typeof value === "string" && value.trim());
  return typeof name === "string" ? name.trim() : undefined;
}

/**
 * スキルに合わせて並べた、そのチームの候補(コートの6人+リベロ)。
 * R・D・F は後衛とリベロを先に、E はセッターを先に、A は前衛を先に(後衛のあと。リベロは入れない)、B は前衛だけ。
 */
export function buildCandidates(lineup: IaLineup, team: Pick<IaTeam, "players" | "libero">, skill: IaSkill): IaCandidate[] {
  const setter = lineup.positions[String(lineup.setterAt) as IaPosition];
  const make = (position: IaPosition, row: "front" | "back"): IaCandidate | null => {
    const shirt = lineup.positions[position];
    if (shirt === null || shirt === undefined) {
      return null;
    }
    return {
      shirt,
      position,
      row,
      isSetter: shirt === setter,
      label: `${row === "front" ? "前衛" : "後衛"}${position}`,
      name: playerName(team, shirt),
    };
  };
  const front = FRONT_POSITIONS.map((position) => make(position, "front")).filter(Boolean) as IaCandidate[];
  const back = BACK_POSITIONS.map((position) => make(position, "back")).filter(Boolean) as IaCandidate[];
  const onCourt = new Set([...front, ...back].map((candidate) => candidate.shirt));
  const liberos: IaCandidate[] = (team.libero ?? [])
    .filter((shirt) => Number.isFinite(shirt) && !onCourt.has(shirt))
    .map((shirt) => ({ shirt, position: null, row: "libero", isSetter: false, label: "リベロ", name: playerName(team, shirt) }));

  switch (skill) {
    case "R":
    case "D":
    case "F":
      return [...liberos, ...back, ...front];
    case "E": {
      const all = [...front, ...back];
      return [...all.filter((candidate) => candidate.isSetter), ...all.filter((candidate) => !candidate.isSetter), ...liberos];
    }
    case "A":
      return [...front, ...back];
    case "B":
      return front;
    case "S": {
      const all = [...back, ...front];
      return [...all.filter((candidate) => candidate.position === "1"), ...all.filter((candidate) => candidate.position !== "1")];
    }
  }
}

/** そのチームの背番号(名簿・コート・リベロ)。背番号を打ったとき、1桁で決めてよいかを見るのに使う。 */
export function knownShirts(lineup: IaLineup, team: Pick<IaTeam, "players" | "libero">): number[] {
  const shirts = new Set<number>();
  for (const player of team.players) {
    shirts.add(player.shirtNumber);
  }
  for (const shirt of Object.values(lineup.positions)) {
    if (typeof shirt === "number") {
      shirts.add(shirt);
    }
  }
  for (const shirt of team.libero ?? []) {
    shirts.add(shirt);
  }
  return [...shirts].sort((left, right) => left - right);
}

/**
 * 打ちかけの背番号で決めてよいか:2桁なら決める。1桁で、その数字で始まる2桁の背番号がなければ決める。
 * 背番号が分からない(名簿がない)ときは決めない(少し待つか Enter)。
 */
export function isShirtUnambiguous(buffer: string, shirts: number[]): boolean {
  if (!/^\d{1,2}$/.test(buffer)) {
    return false;
  }
  if (buffer.length === 2) {
    return true;
  }
  if (shirts.length === 0 || buffer === "0") {
    return false;
  }
  return !shirts.some((shirt) => shirt >= 10 && String(shirt).startsWith(buffer));
}

// ---- サーブ(いつも1つ目のタッチ)----

/** サーブの id はラリーの id から決める(画面で選んでいても変わらないように。VSM の _id と同じ 24 桁の16進数のまま)。 */
export function serveIdFor(rallyId: string): string {
  if (!/^[0-9a-f]{24}$/.test(rallyId)) {
    return `${rallyId}-s`;
  }
  const tail = Array.from(rallyId.slice(8), (digit) => (15 - parseInt(digit, 16)).toString(16)).join("");
  return rallyId.slice(0, 8) + tail;
}

/**
 * ラリーのタッチの先頭に、P0 とエンジンから決まるサーブ(サーブするチーム・サーバー・サーブの時刻)を置く。
 * - 自動のサーブ(source auto)は、いつも今の P0 に合わせる
 * - 人が背番号を編集したサーブ(source manual)は、チームが合っていれば背番号を残す(時刻は P0 に合わせる)
 * - VSM から読み込んだタッチ(source なし)にサーブがあれば、そのまま
 * 変わらなければ、元の配列をそのまま返す。
 */
export function syncServePlay(rally: Pick<IaRally, "id" | "serveTime" | "plays">, servingTeam: IaTeamSide, server: number | null): IaPlay[] {
  const plays = rally.plays ?? [];
  const team = teamCode(servingTeam);
  if (plays.some((play) => play.skill === "S" && play.source === undefined)) {
    return plays;
  }
  const first = plays[0];
  const auto: IaPlay = {
    id: first?.skill === "S" ? first.id : serveIdFor(rally.id),
    team,
    player: server ?? 0,
    skill: "S",
    time: rally.serveTime,
    source: "auto",
  };
  if (!first || first.skill !== "S") {
    return [auto, ...plays];
  }
  let serve: IaPlay;
  if (first.source === "manual" && first.team === team) {
    serve = first.time === rally.serveTime ? first : { ...first, time: rally.serveTime };
  } else {
    serve = { ...first, ...auto };
  }
  const unchanged =
    serve === first ||
    (serve.team === first.team && serve.player === first.player && serve.time === first.time && serve.source === first.source);
  return unchanged ? plays : [serve, ...plays.slice(1)];
}

// ---- 進み具合 ----

/** P1 を入れ終えたラリーか:Enter で次へ進んだか、サーブのほかにタッチがある(VSM から読み込んだものも含む)。 */
export function isFlowEntered(rally: Pick<IaRally, "flowDone" | "plays">): boolean {
  return rally.flowDone === true || (rally.plays ?? []).some((play) => play.skill !== "S");
}

export type IaFlowProgress = { setIndex: number; entered: number; total: number };

/** セットごとの P1 の進み具合(数えるのは、得点の計算に使うラリーだけ)。 */
export function flowProgress(sets: IaSet[]): IaFlowProgress[] {
  return sets
    .filter((set) => !set.skipped)
    .map((set) => {
      const result = computeSet(set);
      const ralliesById = new Map(set.rallies.map((rally) => [rally.id, rally]));
      const entered = result.rallies.filter((entry) => {
        const rally = ralliesById.get(entry.rallyId);
        return rally ? isFlowEntered(rally) : false;
      }).length;
      return { setIndex: set.setIndex, entered, total: result.rallies.length };
    });
}

// ---- 注意(止めはしない)----

export type IaFlowWarning = { playId?: string; message: string };

export type FlowWarningContext = {
  lineup: Record<IaTeamSide, IaLineup>;
  teams: Record<IaTeamSide, Pick<IaTeam, "name" | "libero">>;
  pointWinner: IaTeamSide;
};

export function isOnCourt(shirt: number, lineup: IaLineup, team: Pick<IaTeam, "libero">): boolean {
  return Object.values(lineup.positions).includes(shirt) || (team.libero ?? []).includes(shirt);
}

export function flowWarnings(plays: IaPlay[], context: FlowWarningContext): IaFlowWarning[] {
  const warnings: IaFlowWarning[] = [];
  const name = (team: IaTeamCode) => context.teams[sideOfCode(team)].name;

  plays.forEach((play, index) => {
    const side = sideOfCode(play.team);
    // スタメンが入っていないチームは見ない
    const hasLineup = Object.values(context.lineup[side].positions).some((shirt) => shirt !== null);
    if (hasLineup && !isOnCourt(play.player, context.lineup[side], context.teams[side])) {
      warnings.push({ playId: play.id, message: `${play.player}番は、${name(play.team)}のコートにいません(交代の入れ忘れ?)` });
    }
    const contacts = contactsInPossession(plays.slice(0, index + 1));
    if (contacts === MAX_CONTACTS + 1) {
      warnings.push({ playId: play.id, message: `${name(play.team)}が4回続けて触っています` });
    }
  });

  const last = plays.at(-1);
  if (plays.length > 1 && last) {
    const winner = teamCode(context.pointWinner);
    if (last.team !== winner && last.skill === "A") {
      warnings.push({
        playId: last.id,
        message: `最後は点を取られた側(${name(last.team)})のアタックです。アタックミスでなければ、相手のブロック・ディグの入れ忘れかも`,
      });
    } else if (last.team === winner && (last.skill === "R" || last.skill === "E" || last.skill === "D" || last.skill === "F")) {
      warnings.push({
        playId: last.id,
        message: `最後は点を取った側(${name(last.team)})の${SKILL_LABELS[last.skill]}です。続きの入れ忘れかも`,
      });
    }
  }
  return warnings;
}

// ---- 書き出しの仮の種類・評価 ----

/** 田中のデータで一番多い種類(hitType)。P4 で上書きする。 */
export const DEFAULT_HIT_TYPE: Record<IaSkill, string> = { S: "M", R: "M", E: "M", A: "M", B: "M", D: "M", F: "H" };
/** 田中のデータで一番多い評価(effect)。P2 で上書きする。 */
export const DEFAULT_EFFECT: Record<IaSkill, string> = { S: "-", R: "#", E: "+", A: "#", B: "=", D: "+", F: "+" };

/**
 * 評価の決まっていないタッチに、書き出す仮の評価を入れる(セッションのタッチは書き換えない)。
 * P1 を入れ終えたラリーでは、最後のタッチを点と合わせる:点を取られた側なら「=」、
 * 点を取った側のサーブ・アタック・ブロックなら「#」。
 */
export function placeholderEffects(plays: IaPlay[], pointWinner: IaTeamCode, entered: boolean): string[] {
  return plays.map((play, index) => {
    if (play.effect !== undefined) {
      return play.effect;
    }
    if (entered && index === plays.length - 1) {
      if (play.team !== pointWinner) {
        return "=";
      }
      if (play.skill === "A" || play.skill === "S" || play.skill === "B") {
        return "#";
      }
    }
    return DEFAULT_EFFECT[play.skill];
  });
}

/** 書き出すときのタッチ:種類・評価が決まっていなければ仮のものを入れる。 */
export function withPlaceholders(plays: IaPlay[], pointWinner: IaTeamCode, entered: boolean): IaPlay[] {
  const effects = placeholderEffects(plays, pointWinner, entered);
  return plays.map((play, index) => ({
    ...play,
    hitType: play.hitType ?? DEFAULT_HIT_TYPE[play.skill],
    effect: effects[index],
  }));
}
