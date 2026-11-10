// 担当の表(セット × パス)。だれがどこを打っているか・どこまで進んだか・始めてよいか。
// 担当(claim)はデータベースに持ち、開いている人が 20 秒ごとに「まだいる」を送る(heartbeat)。
// 2 分送られてこなければ「止まっている」とみなし、ほかの人が断りなく引き継げる。

import { computeSet } from "@/lib/domain/input-assist/engine";
import { effectProgress } from "@/lib/domain/input-assist/effect";
import { flowProgress } from "@/lib/domain/input-assist/flow";
import { typeProgress } from "@/lib/domain/input-assist/type";
import { zoneProgress } from "@/lib/domain/input-assist/zone";
import {
  IA_PASSES,
  type IaSliceRecord,
  type IaSliceVersion,
  type InputAssistMeta,
} from "@/lib/domain/input-assist/collab";
import type { IaPassName, IaSet, InputAssistSession } from "@/lib/domain/input-assist/types";

export const PRESENCE_HEARTBEAT_MS = 20 * 1000;
export const PRESENCE_STALE_MS = 2 * 60 * 1000;
export const SYNC_POLL_MS = 4 * 1000;

export const PASS_LABELS: Record<IaPassName, string> = {
  P0: "ラリー",
  P1: "流れ",
  P2: "評価",
  P3: "ゾーン",
  P4: "種類",
};

/** 1つのマス(セット × パス)の担当。 */
export type IaAssignment = {
  setIndex: number;
  pass: IaPassName;
  holderId: string | null;
  holderName: string | null;
  /** 担当している人が最後に「まだいる」を送った時刻。 */
  heartbeatAt: string | null;
  done: boolean;
  doneByName: string | null;
  doneAt: string | null;
};

export function isPresenceStale(heartbeatAt: string | null | undefined, now: number): boolean {
  if (!heartbeatAt) {
    return true;
  }
  const at = Date.parse(heartbeatAt);
  return !Number.isFinite(at) || now - at > PRESENCE_STALE_MS;
}

/** 今、ほかの人が担当していて、止まっていない(断りなく取らない方がよい)か。 */
export function isHeldByOther(assignment: IaAssignment | undefined, memberId: string, now: number): boolean {
  return Boolean(
    assignment?.holderId && assignment.holderId !== memberId && !isPresenceStale(assignment.heartbeatAt, now),
  );
}

/** 1試合の中身をまとめて(画面を開くとき)。 */
export type InputAssistBundle = {
  meta: InputAssistMeta;
  slices: IaSliceRecord[];
  assignments: IaAssignment[];
  passSeconds: IaPassSeconds[];
};

/** 4 秒ごとに見るもの。changed には、手元の版より新しいスライスの中身が入る。 */
export type InputAssistSyncState = {
  metaUpdatedAt: string;
  /** 手元のメタの時刻と違えば、今のメタ。 */
  meta?: InputAssistMeta;
  versions: IaSliceVersion[];
  changed: IaSliceRecord[];
  assignments: IaAssignment[];
  passSeconds: IaPassSeconds[];
};

export type IaCellStatus = "todo" | "working" | "done";
export const CELL_STATUS_LABELS: Record<IaCellStatus, string> = { todo: "未着手", working: "作業中", done: "完了" };

/** 進み具合(数)。done = 済んだ数、total = 全体の数。 */
export type IaCellProgress = { done: number; total: number; text: string };

export type IaReadiness = { ready: boolean; hint: string | null };

export type IaBoardCell = {
  setIndex: number;
  pass: IaPassName;
  status: IaCellStatus;
  assignment: IaAssignment | undefined;
  /** 担当している人が止まっている(2 分なにも送ってこない)。 */
  stale: boolean;
  progress: IaCellProgress;
  readiness: IaReadiness;
  /** このマスにかかった時間(秒)。 */
  seconds: number;
};

export type IaBoardRow = { setIndex: number; cells: IaBoardCell[] };

/** マスごとにかかった時間の合計(だれが打ったかを問わない)。 */
export type IaPassSeconds = { setIndex: number; pass: IaPassName; seconds: number };

/** マスごとの進み具合。各パスの進み具合の関数をそのまま使う。 */
export function buildProgress(sets: IaSet[], extras?: InputAssistSession["extras"]): Map<string, IaCellProgress> {
  const output = new Map<string, IaCellProgress>();
  const key = (setIndex: number, pass: IaPassName) => `${setIndex}-${pass}`;
  for (const set of sets) {
    if (set.skipped) {
      continue;
    }
    const result = computeSet(set);
    output.set(key(set.setIndex, "P0"), {
      done: result.countedRallies,
      total: result.requiredRallies ?? result.countedRallies,
      text:
        set.rallies.length === 0
          ? "ラリーなし"
          : `${result.countedRallies}/${result.requiredRallies ?? "?"}本${result.undecidedRallies > 0 ? `・未定${result.undecidedRallies}` : ""}`,
    });
  }
  for (const entry of flowProgress(sets)) {
    output.set(key(entry.setIndex, "P1"), { done: entry.entered, total: entry.total, text: `${entry.entered}/${entry.total}` });
  }
  for (const entry of effectProgress(sets)) {
    output.set(key(entry.setIndex, "P2"), {
      done: entry.decided,
      total: entry.total,
      text: entry.total === 0 ? "–" : `${entry.decided}/${entry.total}${entry.remaining > 0 ? `・残り${entry.remaining}` : ""}`,
    });
  }
  for (const entry of zoneProgress(sets, extras?.attackCombinations)) {
    output.set(key(entry.setIndex, "P3"), {
      done: entry.done,
      total: entry.needed,
      text: entry.needed === 0 ? "–" : `${entry.done}/${entry.needed}`,
    });
  }
  for (const entry of typeProgress(sets, { combinations: extras?.attackCombinations, setterCalls: extras?.setterCalls })) {
    output.set(key(entry.setIndex, "P4"), {
      done: entry.decided,
      total: entry.total,
      text: entry.total === 0 ? "–" : `${entry.decided}/${entry.total}${entry.remaining > 0 ? `・残り${entry.remaining}` : ""}`,
    });
  }
  return output;
}

function isComplete(progress: IaCellProgress | undefined): boolean {
  return Boolean(progress && progress.total > 0 && progress.done >= progress.total);
}

/**
 * 始めてよいか(止めはしない。目安を出すだけ)。
 * - P1:そのセットの P0 が完了か、ラリーがあれば始められる
 * - P2・P3・P4:そのセットの P1 が完了か、P1 を全部入れ終えていれば始められる。途中なら、入れ終えたラリーだけ打てる
 */
export function passReadiness(
  pass: IaPassName,
  context: {
    hasVideo: boolean;
    rallyCount: number;
    p0Done: boolean;
    p1Done: boolean;
    p1Progress: IaCellProgress | undefined;
  },
): IaReadiness {
  if (pass === "P0") {
    return context.hasVideo ? { ready: true, hint: null } : { ready: false, hint: "動画の URL がない" };
  }
  if (pass === "P1") {
    if (context.p0Done) {
      return { ready: true, hint: null };
    }
    return context.rallyCount > 0
      ? { ready: true, hint: "P0 が途中" }
      : { ready: false, hint: "P0 がまだ" };
  }
  if (context.p1Done || isComplete(context.p1Progress)) {
    return { ready: true, hint: null };
  }
  if (context.p1Progress && context.p1Progress.done > 0) {
    return { ready: true, hint: `P1 が途中(${context.p1Progress.done}/${context.p1Progress.total})` };
  }
  return { ready: false, hint: "P1 がまだ" };
}

export function cellStatus(
  assignment: IaAssignment | undefined,
  progress: IaCellProgress | undefined,
): IaCellStatus {
  if (assignment?.done) {
    return "done";
  }
  if (assignment?.holderId || (progress && progress.done > 0)) {
    return "working";
  }
  return "todo";
}

/** 担当の表を作る(打たないセットは出さない)。 */
export function buildBoard(
  session: Pick<InputAssistSession, "sets" | "extras">,
  assignments: IaAssignment[],
  passSeconds: IaPassSeconds[],
  now: number,
  progress: Map<string, IaCellProgress> = buildProgress(session.sets, session.extras),
): IaBoardRow[] {
  const assignmentOf = (setIndex: number, pass: IaPassName) =>
    assignments.find((entry) => entry.setIndex === setIndex && entry.pass === pass);
  return session.sets
    .filter((set) => !set.skipped)
    .map((set) => {
      const p1Progress = progress.get(`${set.setIndex}-P1`);
      const context = {
        hasVideo: Boolean(set.youtubeUrl),
        rallyCount: set.rallies.filter((rally) => rally.status === "rally").length,
        p0Done: Boolean(assignmentOf(set.setIndex, "P0")?.done),
        p1Done: Boolean(assignmentOf(set.setIndex, "P1")?.done),
        p1Progress,
      };
      return {
        setIndex: set.setIndex,
        cells: IA_PASSES.map((pass) => {
          const assignment = assignmentOf(set.setIndex, pass);
          const cellProgress = progress.get(`${set.setIndex}-${pass}`) ?? { done: 0, total: 0, text: "–" };
          return {
            setIndex: set.setIndex,
            pass,
            status: cellStatus(assignment, cellProgress),
            assignment,
            stale: Boolean(assignment?.holderId) && isPresenceStale(assignment?.heartbeatAt, now),
            progress: cellProgress,
            readiness: passReadiness(pass, context),
            seconds: passSeconds
              .filter((entry) => entry.setIndex === set.setIndex && entry.pass === pass)
              .reduce((total, entry) => total + entry.seconds, 0),
          };
        }),
      };
    });
}

/** 「3分前」など。 */
export function formatAgo(at: string | null | undefined, now: number): string {
  if (!at) {
    return "";
  }
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (!Number.isFinite(seconds)) {
    return "";
  }
  if (seconds < 60) {
    return "今";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分前`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}時間前` : `${Math.floor(hours / 24)}日前`;
}
