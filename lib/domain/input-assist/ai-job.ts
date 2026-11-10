// AI に骨組みを頼む(2026-11-10 から)。重い画像解析は Vercel では動かせないので、サイトに依頼をため、
// Mac(のちに Wisteria)の「係」(scouting-ai の tools/ai_worker.py)が取りに行く。
// やり取りの決まり:vault の 02_Projects/スカウティングAI/設計_webで完結.md
//
// 依頼:待ち(pending)→ 解析中(running。係が受け取った)→ できた(done)か失敗(failed)。
// 解析中のまま 30 分なにも送ってこなければ、係が止まったとみなし、次の係が受け取り直せる。
// できたら、ラリーが空のセットには自動で入れる。入っているセットは、画面で「入れ替える」を押したときだけ入れる。

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
  /** できた骨組み(できたときだけ)。 */
  skeleton: IaSkeleton | null;
  resultMeta: Record<string, unknown> | null;
  applied: IaAiJobApplied | null;
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
