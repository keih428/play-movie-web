// AI に骨組みを頼む(2026-11-10 から)。重い画像解析は Vercel では動かせないので、サイトに依頼をため、
// Mac(のちに Wisteria)の「係」(scouting-ai の tools/ai_worker.py)が取りに行く。
// やり取りの決まり:vault の 02_Projects/スカウティングAI/設計_webで完結.md
//
// 依頼:待ち(pending)→ 解析中(running。係が受け取った)→ できた(done)か失敗(failed)。
// 解析中のまま 30 分なにも送ってこなければ、係が止まったとみなし、次の係が受け取り直せる。
// できたら、ラリーが空のセットには自動で入れる。入っているセットは、画面で「入れ替える」を押したときだけ入れる。
// セットごとの途中の結果(2026-11-11 から):係はセットが終わるたびに partial で送る。届いたセットから同じ決まりで入れる
// (1セット目の骨組みを、試合ぜんぶの解析を待たずに打ち始められる)。

import type { IaP0Rally } from "@/lib/domain/input-assist/collab";
import { roundTime } from "@/lib/domain/input-assist/session";
import type { IaSet, IaSkeleton, IaTeamSide } from "@/lib/domain/input-assist/types";

export type IaAiJobStatus = "pending" | "running" | "done" | "failed";

export const AI_JOB_STATUS_LABELS: Record<IaAiJobStatus, string> = {
  pending: "待ち",
  running: "解析中",
  done: "できた",
  failed: "失敗",
};

/** 係が受け取ったまま、これだけ何も送ってこなければ、受け取り直せる。 */
export const AI_JOB_LEASE_MS = 30 * 60 * 1000;

/** 係に渡す、1セットぶんの依頼。 */
export type IaAiJobSet = {
  setIndex: number;
  youtubeUrl: string;
  startSec: number;
  endSec: number | null;
  finalScore: { home: number; away: number };
  nearTeam: IaTeamSide;
  refereeHint: null;
};

/** 係が claim で受け取る形。 */
export type IaAiJobClaim = {
  jobId: string;
  sessionId: string;
  teamSlug: string;
  sets: IaAiJobSet[];
};

/** 骨組みが届いたときに、どのセットに入れたか。 */
export type IaAiJobApplied = {
  /** ラリーが空だったので、自動で入れたセット。 */
  applied: number[];
  /** ラリーが入っていたので、入れなかったセット(画面で「入れ替える」)。 */
  waiting: number[];
};

/** セットごとの状態:待ち / 解析中 / できた / 入れた / 入れ替え待ち(依頼が失敗したら、できていないセットは 失敗)。 */
export type IaAiSetState = "pending" | "running" | "done" | "applied" | "waiting" | "failed";

export const AI_SET_STATE_LABELS: Record<IaAiSetState, string> = {
  pending: "待ち",
  running: "解析中",
  done: "できた",
  applied: "入れた",
  waiting: "入れ替え待ち",
  failed: "失敗",
};

export type IaAiJobSetState = {
  setIndex: number;
  state: IaAiSetState;
  /** 骨組みのラリーの本数(できたセットだけ)。 */
  rallyCount: number | null;
};

/** 画面に出す依頼(GET /sessions/:id/ai-jobs)。 */
export type IaAiJobSummary = {
  id: string;
  status: IaAiJobStatus;
  sets: IaAiJobSet[];
  progressMessage: string | null;
  progressPercent: number | null;
  error: string | null;
  createdAt: string | null;
  createdByName: string | null;
  leasedAt: string | null;
  finishedAt: string | null;
  /** できた骨組み。解析中は、届いたセットぶん(途中の結果)。まだ何も届いていなければ null。 */
  skeleton: IaSkeleton | null;
  resultMeta: Record<string, unknown> | null;
  applied: IaAiJobApplied | null;
  /** セットごとの状態(サーバーから見た状態。「入れ替える」を押したかは、画面で試合の中身と合わせて見る)。 */
  setStates: IaAiJobSetState[];
};

function sameVideo(left: string, right: string): boolean {
  return left.trim() !== "" && left.trim() === right.trim();
}

/**
 * 準備の中身から、係に渡すセットを作る。打たないセットは外す。
 * 打つセットには、YouTube の URL と最終スコアが要る(なければその理由を返す)。
 * 終わりの秒は、次のセットが同じ動画で開始時刻があれば、その時刻。なければ null(動画の最後まで)。
 */
export function buildAiJobSets(sets: IaSet[]): { sets: IaAiJobSet[]; error?: undefined } | { sets?: undefined; error: string } {
  const ordered = [...sets].sort((left, right) => left.setIndex - right.setIndex);
  const target = ordered.filter((set) => !set.skipped);
  if (target.length === 0) {
    return { error: "打つセットがありません。準備でセットを足してください。" };
  }
  const missing = target.filter(
    (set) => !set.youtubeUrl.trim() || set.finalScore.home === null || set.finalScore.away === null,
  );
  if (missing.length > 0) {
    return {
      error: `${missing.map((set) => set.setIndex).join("・")}セット目の YouTube の URL と最終スコアを入れてください。`,
    };
  }
  return {
    sets: target.map((set) => {
      const next = ordered[ordered.indexOf(set) + 1];
      const startSec = typeof set.startTime === "number" ? set.startTime : 0;
      const nextStart = next && typeof next.startTime === "number" && sameVideo(next.youtubeUrl, set.youtubeUrl)
        ? next.startTime
        : null;
      return {
        setIndex: set.setIndex,
        youtubeUrl: set.youtubeUrl.trim(),
        startSec,
        endSec: nextStart !== null && nextStart > startSec ? nextStart : null,
        finalScore: { home: set.finalScore.home as number, away: set.finalScore.away as number },
        nearTeam: set.nearTeam,
        refereeHint: null,
      };
    }),
  };
}

/**
 * 骨組みから作るラリーの id。依頼とセットとラリーの順から決まる(何度入れても同じ id になり、二重にならない)。
 * VSM の _id と同じ 24 桁の16進数:依頼の id の頭 10 桁 + セット 2 桁 + 順 4 桁 + 依頼の id の終わり 8 桁。
 */
export function skeletonRallyId(jobId: string, setIndex: number, index: number): string {
  const hex = (value: number, length: number) => value.toString(16).padStart(length, "0").slice(-length);
  return `${jobId.slice(0, 10).padEnd(10, "0")}${hex(setIndex, 2)}${hex(index, 4)}${jobId.slice(-8).padStart(8, "0")}`;
}

/** 骨組みの、1セットぶんのラリー(P0 のスライスの形。時刻の順)。 */
export function skeletonRalliesForSet(skeleton: IaSkeleton, setIndex: number, jobId: string): IaP0Rally[] {
  return skeleton.rallies
    .filter((rally) => rally.set === setIndex)
    .sort((left, right) => left.serveTime - right.serveTime)
    .map((rally, index) => {
      const output: IaP0Rally = {
        id: skeletonRallyId(jobId, setIndex, index),
        serveTime: roundTime(rally.serveTime),
        side: rally.side ?? null,
        status: "rally",
        source: "auto",
      };
      if (typeof rally.pSide === "number" && Number.isFinite(rally.pSide)) {
        output.confidence = rally.pSide;
      }
      return output;
    });
}

/** その依頼の骨組みが、もうこのセットに入っているか(入れたラリーが残っているか)。 */
export function hasSkeletonApplied(rallies: Array<{ id: string }>, jobId: string, setIndex: number): boolean {
  const first = skeletonRallyId(jobId, setIndex, 0);
  return rallies.some((rally) => rally.id === first);
}

/**
 * 骨組みを、どのセットに自動で入れるか。
 * - 骨組みにあって、試合にあり、打たないセットでなく、ラリーが空 → 自動で入れる(apply)
 * - ラリーが入っている → 入れない(画面で「入れ替える」を押したときだけ。ask)
 * - 試合にない・打たないセット → 入れない(ignored)
 */
export function planSkeletonApply(
  skeleton: IaSkeleton,
  sets: Array<{ setIndex: number; skipped?: boolean; rallyCount: number }>,
): { apply: number[]; ask: number[]; ignored: number[] } {
  const setIndexes = [...new Set(skeleton.rallies.map((rally) => rally.set))].sort((left, right) => left - right);
  const plan = { apply: [] as number[], ask: [] as number[], ignored: [] as number[] };
  for (const setIndex of setIndexes) {
    const set = sets.find((entry) => entry.setIndex === setIndex);
    if (!set || set.skipped) {
      plan.ignored.push(setIndex);
    } else if (set.rallyCount === 0) {
      plan.apply.push(setIndex);
    } else {
      plan.ask.push(setIndex);
    }
  }
  return plan;
}

/** 骨組みに入っているセット(小さい順)。 */
export function skeletonSetIndexes(skeleton: IaSkeleton | null | undefined): number[] {
  return [...new Set((skeleton?.rallies ?? []).map((rally) => rally.set))].sort((left, right) => left - right);
}

/**
 * 途中の結果をまとめる。update にあるセットは、base のそのセットと入れ替える(あとから届いたほうが正)。
 * update にないセットは base のまま。
 */
export function mergeSkeletonSets(base: IaSkeleton | null | undefined, update: IaSkeleton): IaSkeleton {
  const replaced = new Set(skeletonSetIndexes(update));
  const youtube = { ...(base?.youtube ?? {}), ...(update.youtube ?? {}) };
  const rallies = [...(base?.rallies ?? []).filter((rally) => !replaced.has(rally.set)), ...update.rallies].sort(
    (left, right) => left.set - right.set || left.serveTime - right.serveTime,
  );
  return { version: 1, ...(Object.keys(youtube).length > 0 ? { youtube } : {}), rallies };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

/** ラリーの並びが、中身まで同じか(キーの順は問わない。データベースに入れるとキーの順が変わるため)。 */
export function sameRallies(left: ReadonlyArray<object>, right: ReadonlyArray<object>): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

/**
 * 1セットぶんの骨組みが届いたとき、どうするか。
 * - skip:前に同じ中身を入れてある(二度は入れない)。または、もう同じラリーが入っている
 * - apply:ラリーが空。または、前にこの依頼で自動で入れたラリーが、人の手が入らないまま残っている(新しい骨組みで入れ替える)
 * - ask:人がラリーを入れている(画面で「入れ替える」を押したときだけ)
 */
export function decideSetApply(input: {
  /** 今届いたセットのラリー(skeletonRalliesForSet の形)。 */
  next: IaP0Rally[];
  /** 前に届いていた同じセットのラリー(なければ null)。 */
  previous: IaP0Rally[] | null;
  /** 前に届いたとき、入れたか・待たせたか。 */
  previousOutcome: "applied" | "waiting" | null;
  /** 今、試合に入っているラリー(P0)。 */
  current: ReadonlyArray<object>;
  /** P1〜P4 に、まだ何も入っていないか。 */
  laterPassesEmpty: boolean;
}): "skip" | "apply" | "ask" {
  const { next, previous, previousOutcome, current, laterPassesEmpty } = input;
  if (previousOutcome === "applied" && previous && sameRallies(previous, next)) {
    return "skip";
  }
  if (current.length > 0 && sameRallies(current, next)) {
    return "skip";
  }
  if (current.length === 0) {
    return "apply";
  }
  if (previousOutcome === "applied" && previous && laterPassesEmpty && sameRallies(current, previous)) {
    return "apply";
  }
  return "ask";
}

/**
 * セットごとの状態(サーバーから見た状態)。
 * 骨組みが届いたセットは、入れた / 入れ替え待ち / できた。届いていないセットは、
 * 解析中の依頼なら最初の1つが 解析中、残りは 待ち(係は前のセットから順に解析する)。失敗した依頼なら 失敗。
 */
export function aiJobSetStates(
  job: Pick<IaAiJobSummary, "status" | "sets" | "skeleton" | "applied">,
): IaAiJobSetState[] {
  const finished = new Set(skeletonSetIndexes(job.skeleton));
  const indexes = [...new Set([...job.sets.map((set) => set.setIndex), ...finished])].sort((left, right) => left - right);
  let runningMarked = false;
  return indexes.map((setIndex) => {
    if (finished.has(setIndex)) {
      const state: IaAiSetState = job.applied?.applied.includes(setIndex)
        ? "applied"
        : job.applied?.waiting.includes(setIndex)
          ? "waiting"
          : "done";
      const rallyCount = (job.skeleton?.rallies ?? []).filter((rally) => rally.set === setIndex).length;
      return { setIndex, state, rallyCount };
    }
    let state: IaAiSetState = "pending";
    if (job.status === "failed") {
      state = "failed";
    } else if (job.status === "running" && !runningMarked) {
      state = "running";
      runningMarked = true;
    } else if (job.status === "done") {
      // できたのに骨組みがないセット(ラリーが見つからなかった)
      state = "done";
    }
    return { setIndex, state, rallyCount: job.status === "done" ? 0 : null };
  });
}

/**
 * セットごとの状態を一行に(「2セット目 できた・3セット目 解析中」。続く同じ状態は「1・2セット目 入れた」とまとめる)。
 * 解析中・待ちのあとに続く「待ち」は書かない。
 */
export function describeAiSetStates(states: ReadonlyArray<Pick<IaAiJobSetState, "setIndex" | "state">>): string {
  const shown = states.filter((entry) => entry.state !== "pending");
  const groups: Array<{ indexes: number[]; state: IaAiSetState }> = [];
  for (const entry of shown) {
    const last = groups[groups.length - 1];
    if (last && last.state === entry.state) {
      last.indexes.push(entry.setIndex);
    } else {
      groups.push({ indexes: [entry.setIndex], state: entry.state });
    }
  }
  return groups.map((group) => `${group.indexes.join("・")}セット目 ${AI_SET_STATE_LABELS[group.state]}`).join("・");
}

/** 「12:34」「1:02:03」「754」(秒)を秒に。読めなければ null。空なら null。 */
export function parseClockInput(text: string): number | null {
  const value = text.trim();
  if (!value) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) {
    return null;
  }
  return parts.map(Number).reduce((total, part) => total * 60 + part, 0);
}

/** 秒を「m:ss」(1時間を超えれば「h:mm:ss」)に。 */
export function formatClockInput(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return "";
  }
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** 依頼の状態を一言で(「解析中 45% 動画を落としています」など)。 */
export function describeAiJob(job: Pick<IaAiJobSummary, "status" | "progressPercent" | "progressMessage" | "error">): string {
  if (job.status === "running") {
    const percent = typeof job.progressPercent === "number" ? ` ${Math.round(job.progressPercent)}%` : "";
    return `解析中${percent}${job.progressMessage ? ` ${job.progressMessage}` : ""}`;
  }
  if (job.status === "failed") {
    return `失敗:${job.error || "理由が分かりません"}`;
  }
  return AI_JOB_STATUS_LABELS[job.status];
}
