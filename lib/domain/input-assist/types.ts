// 打ち込み補助(v1)のデータの形。1つの試合 = 1つのセッション。
// 動画の時刻は秒(小数)。VSM に書き出すときに 10 倍して整数にする。

export type IaTeamSide = "home" | "away";
/** VSM の team の値。ホームは "*"、アウェイは "a"。 */
export type IaTeamCode = "*" | "a";
/** 動画で手前に映っている側(near)か奥(far)か。 */
export type IaCourtSide = "near" | "far";

export type IaPlayer = {
  shirtNumber: number;
  code?: string;
  firstName?: string;
  lastName?: string;
  position?: number;
  _id?: string;
  [key: string]: unknown;
};

/** VSM / vsdb の team.home / team.away をそのまま持つ(書き出すときにそのまま戻す)。 */
export type IaTeam = {
  name: string;
  code?: string;
  shortCode?: string;
  libero?: number[];
  players: IaPlayer[];
  /** VSM ではコーチなど5つの空のもの({ coach: {}, … })。 */
  staff?: unknown;
  [key: string]: unknown;
};

export type IaPosition = "1" | "2" | "3" | "4" | "5" | "6";
export const IA_POSITIONS: IaPosition[] = ["1", "2", "3", "4", "5", "6"];

export type IaLineup = {
  /** 位置ごとの背番号。決まっていなければ null。 */
  positions: Record<IaPosition, number | null>;
  /** セッターのいる位置(1〜6)。 */
  setterAt: number;
};

export type IaSkill = "S" | "R" | "E" | "A" | "B" | "D" | "F";
export const IA_SKILLS: IaSkill[] = ["S", "R", "E", "A", "B", "D", "F"];

/**
 * 1つのタッチ。team は VSM の値("*" = ホーム、"a" = アウェイ)、player は背番号。
 * P1(流れ)で入れたものは team・player・skill・time だけで、hitType・effect はない。
 * effect がない = 評価はまだ決まっていない(P2 で入れる)。書き出すときは仮の評価を入れる(flow.ts)。
 * P2 では、迷わない評価は自動で入れ(effectSource auto)、迷う評価は人が決める(effectSource manual)。人が消したら cleared。
 */
export type IaPlay = {
  id: string;
  team: IaTeamCode;
  player: number;
  skill: IaSkill;
  /** P1 で入れたプレーの出どころ。auto = P0 とエンジンから自動で作ったサーブ、manual = 人が入れた。VSM から読み込んだものにはない。 */
  source?: "auto" | "manual";
  hitType?: string;
  effect?: string;
  /**
   * P2 の評価の出どころ。auto = 前後のタッチから自動で入れた、manual = 人が決めた、
   * cleared = 人が消した(自動で入れ直さない。書き出すときは仮の評価)。VSM から読み込んだものにはない(人が決めたものと同じに扱う)。
   */
  effectSource?: "auto" | "manual" | "cleared";
  /** 動画の時刻(秒)。 */
  time?: number;
  startZone?: number;
  startSubZone?: string;
  endZone?: number;
  endSubZone?: string;
  /**
   * P3 のゾーンの出どころ(始まり・終わりそれぞれ)。auto = 攻撃コンビや前後のタッチから自動で入れた(流れが変われば入れ直す)、
   * manual = 人がコートを押して決めた。VSM から読み込んだものにはない(人が決めたものと同じに扱う)。
   */
  startZoneSource?: "auto" | "manual";
  endZoneSource?: "auto" | "manual";
  /** トスのセッターコール(KA など)・アタックのコンビ(PV など)。 */
  combination?: string;
  /** ミスの種類など。 */
  special?: string;
  targetAttacker?: string;
  /** ブロックの人数。 */
  players?: number;
  skillType?: string;
  /** VSM から読み込んだときの code(書き換えずに戻す)。なければ書き出すときに作る。 */
  code?: string;
  /** VSM にあった、ここで扱わない欄(そのまま戻す)。 */
  extra?: Record<string, unknown>;
};

export type IaRally = {
  id: string;
  /** サーブを打った時刻(動画の秒)。 */
  serveTime: number;
  /** サーブを打った側。まだ決まっていなければ null。 */
  side: IaCourtSide | null;
  /** AI の確かさ(0〜1)。人が決めたものにはない。 */
  confidence?: number;
  status: "rally" | "not_rally";
  source: "auto" | "manual";
  /** 人が確かめた(N/F/X を押した)か。 */
  checked?: boolean;
  plays?: IaPlay[];
  /** P1(流れ)で、このラリーのタッチを入れ終えた(Enter で次へ進んだ)か。サーブだけのラリー(エース・サーブミス)もこれで分かる。 */
  flowDone?: boolean;
};

export type IaSubstitution = {
  id: string;
  /** 交代した時刻(動画の秒)。この時刻より後のラリーから入れ替わる。 */
  time: number;
  team: IaTeamSide;
  playerIn: number;
  playerOut: number;
};

export type IaTimeout = {
  id: string;
  /** タイムアウトを取った時刻(動画の秒)。 */
  time: number;
  team: IaTeamSide;
};

export type IaSet = {
  setIndex: number;
  youtubeUrl: string;
  /** 手前に映っているチーム(ふつうはホーム = 東大)。 */
  nearTeam: IaTeamSide;
  startingLineup: Record<IaTeamSide, IaLineup>;
  finalScore: { home: number | null; away: number | null };
  rallies: IaRally[];
  substitutions: IaSubstitution[];
  timeouts: IaTimeout[];
  /** このセットは打たない(例:引退する4年生を入れた1セット目)。P0 の一覧・得点の確認・VSM の書き出しから外す。 */
  skipped?: boolean;
};

export type IaPassName = "P0" | "P1" | "P2" | "P3";

export type IaPassLog = {
  id: string;
  setIndex: number;
  pass: IaPassName;
  startedAt: string;
  endedAt: string;
  /** 実際に作業していた秒数(タブを開いていた間だけ数える)。 */
  seconds: number;
  memberId?: string;
  memberName?: string;
};

/** VSM の、チーム以外で持ち回るもの(アタックのコンビなど)。 */
export type IaMatchExtras = {
  gameType?: string;
  attackCombinations?: unknown[];
  setterCalls?: unknown[];
};

export type InputAssistSession = {
  id: string;
  teamSlug: string;
  title: string;
  /** 試合の日(YYYY-MM-DD)。 */
  date: string;
  opponent: string;
  /** VSM の scout.video.path(動画のファイル名)。空なら日付と相手から作る。 */
  videoPath?: string;
  teams: Record<IaTeamSide, IaTeam>;
  extras: IaMatchExtras;
  sets: IaSet[];
  passLogs: IaPassLog[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

export type InputAssistSessionSummary = Pick<
  InputAssistSession,
  "id" | "teamSlug" | "title" | "date" | "opponent" | "createdAt" | "updatedAt"
> & {
  setCount: number;
  rallyCount: number;
};

/** AI が作る骨組み(Python から渡す JSON)。 */
export type IaSkeleton = {
  version: 1;
  youtube?: Record<string, string>;
  rallies: Array<{
    set: number;
    serveTime: number;
    side?: IaCourtSide | null;
    pSide?: number;
    source?: "auto" | "manual";
  }>;
};
