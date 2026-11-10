// P3(ゾーン):ボールが触られた位置を、1タッチ1クリックで入れる。
// 田中のデータでは、あるタッチの終わりのゾーン = 次のタッチの始まりのゾーン(S → 相手の R 100%、R → 同じ E 100%、
// E → 同じ A 97%、A → 相手の D 100%・B 97%、D → 同じ E 100%、F → 同じ E 99%。サブゾーンも同じ)。
// だから1回押すと、前のタッチの終わりと今のタッチの始まりが一度に決まる。最後に、ボールが落ちた場所を1回押す。
// ここには画面から切り離した計算だけを置く(コートの位置 → ゾーン・サブゾーン、つなぎ、攻撃コンビからの始まり、進み具合)。
// 設計:02_Projects/スカウティングAI/設計_打ち込み補助v1.md の「P3 ゾーン」。
//
// ---- コートの向き(VSM / DataVolley の決まり)----
// ゾーンは、いつも「そのコートのチームから見た向き」(自分のエンドラインの後ろからネットを見る。ネットが上)。
//
//   ネット
//   4 3 2   前(ネットから 0〜3m)
//   7 8 9   中(3〜6m)
//   5 6 1   後ろ(6〜9m)
//   エンドライン
//
// 1つのゾーンを 4 つに分けたサブゾーン(同じく、ネットが上):
//
//   C B   ネット側
//   D A   エンドライン側
//
// サブゾーンの並びは、田中の 13 試合(11,035 プレー)から推し量った(要確認。バレーステーションの画面と照らす):
// - 攻撃コンビ PV(レフトの平行)は 4C、PZ(ライトの平行)は 2B。相手のブロックは 4C → 2B・2B → 4C(ネットをはさんで左右が逆)
//   → C と B はネット側で、C が左・B が右
// - セッターコール K3「zone3 High」は 3C・3B、K6「Zone3-Low」は 3D・3A → D と A はエンドライン側
// - クイック KA・KB(セッターの前)は 3C、KC(セッターの後ろ)は 3B、KD(後ろに離れる)は 2C → C が左・B が右
// - レセプションの始まりは、ゾーン5 なら B、ゾーン7 なら A、ゾーン1 なら D が多い(コートの内側)→ A・B が右、C・D が左
// なお、試合ビューアのコースの図(lib/domain/court.ts の getEndZonePoint)は、サブゾーンの置き方がこれと違う。
//
// サーブの始まり(エンドラインの後ろ)は、左から 5・7・6・9・1(court.ts の SERVE_START_ZONES と同じ)。

import { computeSet, teamCode } from "@/lib/domain/input-assist/engine";
import { isFlowEntered, syncServePlay } from "@/lib/domain/input-assist/flow";
import type { IaCourtSide, IaPlay, IaRally, IaSet, IaSkill, IaTeamCode } from "@/lib/domain/input-assist/types";
import { DEFAULT_ATTACK_COMBINATIONS } from "@/lib/domain/input-assist/vsm-defaults";

export type IaSubZone = "A" | "B" | "C" | "D";
export const IA_SUB_ZONES: IaSubZone[] = ["A", "B", "C", "D"];

export type IaZonePosition = { zone: number; subZone?: IaSubZone };

/** そのコートのチームから見た位置。x は左(0)→右(1)、y はネット(0)→エンドライン(1)。1 より大きい y はエンドラインの後ろ。 */
export type IaCourtPoint = { x: number; y: number };

/** 前・中・後ろの列ごとの、左から右のゾーン。 */
export const ZONE_ROWS: number[][] = [
  [4, 3, 2],
  [7, 8, 9],
  [5, 6, 1],
];

/** サブゾーン:[ネット側, エンドライン側] × [左, 右]。 */
const SUB_ZONE_GRID: IaSubZone[][] = [
  ["C", "B"],
  ["D", "A"],
];

/** サーブの始まり(エンドラインの後ろ)。左から右。 */
export const SERVE_ZONES: number[] = [5, 7, 6, 9, 1];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 0.999999);
}

/** そのコートのチームから見た位置 → ゾーンとサブゾーン。コートの外は、いちばん近いゾーンにする。 */
export function zoneAt(point: IaCourtPoint): Required<IaZonePosition> {
  const x = clamp01(point.x) * 3;
  const y = clamp01(point.y) * 3;
  const column = Math.floor(x);
  const row = Math.floor(y);
  const subColumn = x - column < 0.5 ? 0 : 1;
  const subRow = y - row < 0.5 ? 0 : 1;
  return { zone: ZONE_ROWS[row][column], subZone: SUB_ZONE_GRID[subRow][subColumn] };
}

/** サーブの始まり:エンドラインに沿った左右の位置(0〜1)→ 5・7・6・9・1。 */
export function serveZoneAt(x: number): number {
  return SERVE_ZONES[Math.floor(clamp01(x) * SERVE_ZONES.length)];
}

/** ゾーン(とサブゾーン)の真ん中(そのコートのチームから見た位置)。図に印を置くのに使う。 */
export function zoneCenter(zone: number, subZone?: string): IaCourtPoint | null {
  const row = ZONE_ROWS.findIndex((zones) => zones.includes(zone));
  if (row === -1) {
    return null;
  }
  const column = ZONE_ROWS[row].indexOf(zone);
  let dx = 0.5;
  let dy = 0.5;
  if (subZone) {
    const subRow = SUB_ZONE_GRID.findIndex((letters) => letters.includes(subZone as IaSubZone));
    if (subRow !== -1) {
      dx = SUB_ZONE_GRID[subRow].indexOf(subZone as IaSubZone) === 0 ? 0.25 : 0.75;
      dy = subRow === 0 ? 0.25 : 0.75;
    }
  }
  return { x: (column + dx) / 3, y: (row + dy) / 3 };
}

/** サーブの始まりの位置(エンドラインの後ろ。y は 1 より大きい)。 */
export function serveZoneCenter(zone: number): IaCourtPoint | null {
  const index = SERVE_ZONES.indexOf(zone);
  return index === -1 ? null : { x: (index + 0.5) / SERVE_ZONES.length, y: SERVE_BAND };
}

/** 図の、エンドラインの後ろのサーブの帯の真ん中(コートの長さ 9m に対して、y = 1 + 帯 / 2)。 */
const SERVE_BAND = 1.12;

// ---- 図(両方のコート)の位置との行き来 ----
// 図は、手前(near)のチームのコートが下、奥(far)が上。u は図の左(0)→右(1)、v は奥のエンドライン(0)→手前のエンドライン(1)。
// ネットは v = 0.5。0 より小さい v・1 より大きい v は、エンドラインの後ろ。
// 奥のコートは、図では上下も左右も逆に見える(奥のチームから見ると、図の右が左)。

export type IaDiagramPoint = { u: number; v: number };
export type IaCourtLocation = IaCourtPoint & { side: IaCourtSide; behindEndLine: boolean };

export function locateOnDiagram(point: IaDiagramPoint): IaCourtLocation {
  if (point.v >= 0.5) {
    const y = (point.v - 0.5) * 2;
    return { side: "near", x: point.u, y, behindEndLine: y > 1 };
  }
  const y = (0.5 - point.v) * 2;
  return { side: "far", x: 1 - point.u, y, behindEndLine: y > 1 };
}

export function toDiagram(side: IaCourtSide, point: IaCourtPoint): IaDiagramPoint {
  return side === "near" ? { u: point.x, v: 0.5 + point.y / 2 } : { u: 1 - point.x, v: 0.5 - point.y / 2 };
}

// ---- キーで入れる(1〜9 のゾーン + a〜d のサブゾーン)----

/** "5"・"5b"・"5B" → ゾーン 5(サブゾーン B)。読めなければ null。 */
export function parseZoneKeys(buffer: string): IaZonePosition | null {
  const match = /^([1-9])([abcdABCD])?$/.exec(buffer.trim());
  if (!match) {
    return null;
  }
  const zone = Number(match[1]);
  return match[2] ? { zone, subZone: match[2].toUpperCase() as IaSubZone } : { zone };
}

export function formatZone(zone: number | undefined, subZone: string | undefined): string {
  return zone === undefined ? "" : `${zone}${subZone ?? ""}`;
}

// ---- 攻撃コンビから、アタックの始まり ----

type CombinationStart = { code?: unknown; start?: { zone?: unknown; subZone?: unknown } };

/** 攻撃コンビ(PV など)の始まりのゾーン。一覧になければ null。 */
export function combinationStart(
  combination: string | undefined,
  combinations: unknown[] = DEFAULT_ATTACK_COMBINATIONS,
): IaZonePosition | null {
  if (!combination) {
    return null;
  }
  const found = combinations.find((entry) => (entry as CombinationStart)?.code === combination) as CombinationStart | undefined;
  const zone = Number(found?.start?.zone);
  if (!found || !Number.isInteger(zone) || zone < 1 || zone > 9) {
    return null;
  }
  const subZone = found.start?.subZone;
  return typeof subZone === "string" && IA_SUB_ZONES.includes(subZone as IaSubZone)
    ? { zone, subZone: subZone as IaSubZone }
    : { zone };
}

// ---- つなぎ ----

/** 前のタッチの終わりを、次のタッチの始まりとつなぐか(ブロックの終わりは、田中も入れない)。 */
export function chainsToNext(previous: Pick<IaPlay, "skill">): boolean {
  return previous.skill !== "B";
}

type ZoneEnd = "start" | "end";

function readZone(play: IaPlay, end: ZoneEnd): IaZonePosition | null {
  const zone = end === "start" ? play.startZone : play.endZone;
  if (typeof zone !== "number") {
    return null;
  }
  const subZone = end === "start" ? play.startSubZone : play.endSubZone;
  return subZone ? { zone, subZone: subZone as IaSubZone } : { zone };
}

function writeZone(play: IaPlay, end: ZoneEnd, position: IaZonePosition | null, source: "auto" | "manual" | undefined): IaPlay {
  const next: IaPlay = { ...play };
  const [zoneKey, subKey, sourceKey] =
    end === "start"
      ? (["startZone", "startSubZone", "startZoneSource"] as const)
      : (["endZone", "endSubZone", "endZoneSource"] as const);
  delete next[zoneKey];
  delete next[subKey];
  delete next[sourceKey];
  if (position) {
    next[zoneKey] = position.zone;
    if (position.subZone) {
      next[subKey] = position.subZone;
    }
    if (source) {
      next[sourceKey] = source;
    }
  }
  return next;
}

/** code に入る欄(サーブは始まり・終わり・終わりのサブゾーン、アタックは終わり・終わりのサブゾーン)。 */
function codeZoneKey(play: IaPlay): string {
  if (play.skill === "S") {
    return `${play.startZone ?? ""}|${play.endZone ?? ""}|${play.endSubZone ?? ""}`;
  }
  if (play.skill === "A") {
    return `${play.endZone ?? ""}|${play.endSubZone ?? ""}`;
  }
  return "";
}

function sameZones(left: IaPlay, right: IaPlay): boolean {
  return (
    left.startZone === right.startZone &&
    left.startSubZone === right.startSubZone &&
    left.endZone === right.endZone &&
    left.endSubZone === right.endSubZone &&
    left.startZoneSource === right.startZoneSource &&
    left.endZoneSource === right.endZoneSource
  );
}

/** 自動で入れてよい欄か(人が決めた・読み込んだゾーンは変えない。読み込んだタッチ(source なし)には足さない)。 */
function isAutoSlot(play: IaPlay, end: ZoneEnd): boolean {
  if (play.source === undefined) {
    return false;
  }
  const source = end === "start" ? play.startZoneSource : play.endZoneSource;
  const zone = end === "start" ? play.startZone : play.endZone;
  return source === "auto" || zone === undefined;
}

/**
 * 自動のゾーンを入れ直す(effectSource "auto" と同じ考え方)。
 * 1. 自動で入れたゾーンをいったん消す
 * 2. アタックの始まりは、攻撃コンビから(分かるとき)
 * 3. 前のタッチの終わり ↔ 次のタッチの始まりの片方だけ分かっていれば、もう片方に写す(トスの終わり = アタックの始まり、など)
 * 人が決めたゾーン・読み込んだタッチは変えない。code に入るゾーンが変わったら、読み込んだ code は捨てる。
 * 変わらなければ、元の配列をそのまま返す。
 */
export function applyZoneChain(plays: IaPlay[], combinations: unknown[] = DEFAULT_ATTACK_COMBINATIONS): IaPlay[] {
  const next = plays.map((play) => {
    let cleared = play;
    if (play.startZoneSource === "auto") {
      cleared = writeZone(cleared, "start", null, undefined);
    }
    if (play.endZoneSource === "auto") {
      cleared = writeZone(cleared, "end", null, undefined);
    }
    return cleared;
  });

  next.forEach((play, index) => {
    if (play.skill === "A" && play.startZone === undefined && isAutoSlot(play, "start")) {
      const start = combinationStart(play.combination, combinations);
      if (start) {
        next[index] = writeZone(play, "start", start, "auto");
      }
    }
  });

  for (let index = 1; index < next.length; index += 1) {
    const previous = next[index - 1];
    const current = next[index];
    if (!chainsToNext(previous)) {
      continue;
    }
    const end = readZone(previous, "end");
    const start = readZone(current, "start");
    if (end && !start && isAutoSlot(current, "start")) {
      next[index] = writeZone(current, "start", end, "auto");
    } else if (start && !end && isAutoSlot(previous, "end")) {
      next[index - 1] = writeZone(previous, "end", start, "auto");
    }
  }

  let changed = false;
  const result = next.map((play, index) => {
    const original = plays[index];
    if (sameZones(play, original)) {
      return original;
    }
    changed = true;
    if (play.code !== undefined && codeZoneKey(play) !== codeZoneKey(original)) {
      const withoutCode = { ...play };
      delete withoutCode.code;
      return withoutCode;
    }
    return play;
  });
  return changed ? result : plays;
}

/**
 * ボールの位置を1つ決める(人がコートを押した・キーで入れた)。
 * - index がタッチの数より小さい:そのタッチでボールが触られた位置。前のタッチの終わり(つなぐとき)と、そのタッチの始まりになる。
 *   サーブ(1つ目)は、サーブを打った位置(5・7・6・9・1。サブゾーンなし)
 * - index がタッチの数と同じ:ボールが落ちた位置(最後のタッチの終わり)
 * position = null で、そこを消す(攻撃コンビから分かるアタックの始まりは、自動で入れ直す)。
 */
export function applyBallPosition(
  plays: IaPlay[],
  index: number,
  position: IaZonePosition | null,
  combinations: unknown[] = DEFAULT_ATTACK_COMBINATIONS,
): IaPlay[] {
  if (index < 0 || index > plays.length || plays.length === 0) {
    return plays;
  }
  const next = [...plays];
  const source = position ? "manual" : undefined;
  if (index === plays.length) {
    next[index - 1] = writeZone(next[index - 1], "end", position, source);
  } else {
    const current = next[index];
    const start = position && current.skill === "S" && index === 0 ? { zone: position.zone } : position;
    next[index] = writeZone(current, "start", start, source);
    if (index > 0 && chainsToNext(next[index - 1])) {
      next[index - 1] = writeZone(next[index - 1], "end", position, source);
    }
  }
  // 人が決めた欄の code も捨てる(code に入るゾーンが変わったとき)
  const withCodes = next.map((play, playIndex) => {
    const original = plays[playIndex];
    if (play !== original && play.code !== undefined && codeZoneKey(play) !== codeZoneKey(original)) {
      const withoutCode = { ...play };
      delete withoutCode.code;
      return withoutCode;
    }
    return play;
  });
  return applyZoneChain(withCodes, combinations);
}

// ---- 田中の書き方:どのゾーンを入れるか ----

/** 田中がたいてい入れる、始まりのゾーン(S 98%・R 99%・A 88%・B 97%。E 61%・D 47%・F は入れないことが多い)。 */
export const NEEDS_START: Record<IaSkill, boolean> = { S: true, R: true, E: false, A: true, B: true, D: false, F: false };
/** 田中がたいてい入れる、終わりのゾーン(S 94%・R 69%・E 88%・A 79%・F 71%。B は入れず、D は 36%)。 */
export const NEEDS_END: Record<IaSkill, boolean> = { S: true, R: true, E: true, A: true, B: false, D: false, F: true };

/** 押す場所(ステップ)。0〜タッチの数 - 1 はタッチ、タッチの数は「落ちた場所」。 */
export function zoneStepCount(plays: IaPlay[]): number {
  return plays.length === 0 ? 0 : plays.length + 1;
}

/** そのステップを押すと、田中が入れるゾーンが決まるか。 */
export function isZoneStepNeeded(plays: Array<Pick<IaPlay, "skill">>, step: number): boolean {
  if (step === plays.length) {
    const last = plays.at(-1);
    return last ? NEEDS_END[last.skill] : false;
  }
  const current = plays[step];
  if (!current) {
    return false;
  }
  if (NEEDS_START[current.skill]) {
    return true;
  }
  const previous = plays[step - 1];
  return previous !== undefined && chainsToNext(previous) && NEEDS_END[previous.skill];
}

/** そのステップの位置が決まっているか(タッチは始まり、落ちた場所は最後のタッチの終わり)。 */
export function isZoneStepDone(plays: IaPlay[], step: number): boolean {
  if (step === plays.length) {
    return plays.at(-1)?.endZone !== undefined;
  }
  return plays[step]?.startZone !== undefined;
}

/** そのステップで決まった位置(図とキーの表示に使う)。 */
export function zoneOfStep(plays: IaPlay[], step: number): IaZonePosition | null {
  if (step === plays.length) {
    const last = plays.at(-1);
    return last ? readZone(last, "end") : null;
  }
  const play = plays[step];
  return play ? readZone(play, "start") : null;
}

/** そのステップの位置を、どちらのコートで押すか(そのタッチのチームのコート。落ちた場所は、最後のタッチの相手のコートが多い)。 */
export function zoneStepTeam(plays: Array<Pick<IaPlay, "team">>, step: number): IaTeamCode | null {
  if (step < plays.length) {
    return plays[step].team;
  }
  const last = plays.at(-1);
  return last ? (last.team === "a" ? "*" : "a") : null;
}

/** そのステップの位置の出どころ(自動で入れたものは薄く見せる)。 */
export function zoneStepSource(plays: IaPlay[], step: number): "auto" | "manual" | "loaded" | null {
  const play = step === plays.length ? plays.at(-1) : plays[step];
  if (!play) {
    return null;
  }
  const isEnd = step === plays.length;
  const zone = isEnd ? play.endZone : play.startZone;
  if (zone === undefined) {
    return null;
  }
  const source = isEnd ? play.endZoneSource : play.startZoneSource;
  return source ?? "loaded";
}

// ---- P3 で見るラリー ----

export type ZoneRallyEntry = {
  rally: IaRally;
  /** ラリーの番号(得点の計算に使うラリーの中で、1から)。 */
  number: number;
  pointWinner: IaTeamCode;
  /** サーブを先頭に置き、自動のゾーンを入れたタッチ。 */
  plays: IaPlay[];
};

/** P3 で見るラリー:得点の計算に使うラリーで、P1 を入れ終えたもの(時刻の順)。 */
export function zoneRallies(set: IaSet, combinations?: unknown[]): ZoneRallyEntry[] {
  const result = computeSet(set);
  const byId = new Map(set.rallies.map((rally) => [rally.id, rally]));
  const entries: ZoneRallyEntry[] = [];
  for (const rallyResult of result.rallies) {
    const rally = byId.get(rallyResult.rallyId);
    if (!rally || !isFlowEntered(rally)) {
      continue;
    }
    const synced = syncServePlay(rally, rallyResult.servingTeam, rallyResult.server);
    entries.push({
      rally,
      number: rallyResult.number,
      pointWinner: teamCode(rallyResult.pointWinner),
      plays: applyZoneChain(synced, combinations),
    });
  }
  return entries;
}

/** セットの P1 を入れ終えたラリーに、自動のゾーンを入れたもの(変わらなければ元のセット)。 */
export function applyZoneChainToSet(set: IaSet, combinations?: unknown[]): IaSet {
  if (set.skipped) {
    return set;
  }
  const changedPlays = new Map<string, IaPlay[]>();
  for (const entry of zoneRallies(set, combinations)) {
    const stored = entry.rally.plays ?? [];
    const same = stored.length === entry.plays.length && stored.every((play, index) => play === entry.plays[index]);
    if (!same) {
      changedPlays.set(entry.rally.id, entry.plays);
    }
  }
  if (changedPlays.size === 0) {
    return set;
  }
  return {
    ...set,
    rallies: set.rallies.map((rally) => (changedPlays.has(rally.id) ? { ...rally, plays: changedPlays.get(rally.id) } : rally)),
  };
}

export type ZoneQueueMode = "needed" | "all";
export type ZoneQueueItem = { rallyId: string; step: number };

/** 押すステップの並び(ラリーの順、ラリーの中はタッチの順。最後に落ちた場所)。needed = 田中が入れるゾーンが決まるステップだけ。 */
export function buildZoneQueue(entries: ZoneRallyEntry[], mode: ZoneQueueMode): ZoneQueueItem[] {
  return entries.flatMap((entry) => {
    const items: ZoneQueueItem[] = [];
    for (let step = 0; step < zoneStepCount(entry.plays); step += 1) {
      if (mode === "all" || isZoneStepNeeded(entry.plays, step)) {
        items.push({ rallyId: entry.rally.id, step });
      }
    }
    return items;
  });
}

export function sameZoneItem(left: ZoneQueueItem | null, right: ZoneQueueItem | null): boolean {
  return left !== null && right !== null && left.rallyId === right.rallyId && left.step === right.step;
}

/** 次に押すステップ:from より後で、位置の決まっていないもの。後になければ null。 */
export function nextZoneStep(
  queue: ZoneQueueItem[],
  isDone: (item: ZoneQueueItem) => boolean,
  from: ZoneQueueItem | null,
): ZoneQueueItem | null {
  const start = from ? queue.findIndex((item) => sameZoneItem(item, from)) + 1 : 0;
  for (let index = Math.max(start, 0); index < queue.length; index += 1) {
    if (!isDone(queue[index])) {
      return queue[index];
    }
  }
  return null;
}

// ---- 進み具合 ----

export type IaZoneProgress = {
  setIndex: number;
  /** 位置の決まったステップのうち、田中が入れるもの。 */
  done: number;
  /** 田中が入れるステップの数。 */
  needed: number;
  /** P1 を入れ終えたラリーの数。 */
  rallies: number;
};

export function zoneProgress(sets: IaSet[], combinations?: unknown[]): IaZoneProgress[] {
  return sets
    .filter((set) => !set.skipped)
    .map((set) => {
      const entries = zoneRallies(set, combinations);
      let done = 0;
      let needed = 0;
      for (const entry of entries) {
        for (let step = 0; step < zoneStepCount(entry.plays); step += 1) {
          if (isZoneStepNeeded(entry.plays, step)) {
            needed += 1;
            if (isZoneStepDone(entry.plays, step)) {
              done += 1;
            }
          }
        }
      }
      return { setIndex: set.setIndex, done, needed, rallies: entries.length };
    });
}
