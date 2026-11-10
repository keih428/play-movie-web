"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_SET_STATE_LABELS,
  describeAiJob,
  describeAiSetStates,
  hasSkeletonApplied,
  type IaAiJobSummary,
  type IaAiSetState,
} from "@/lib/domain/input-assist/ai-job";
import type { InputAssistSession } from "@/lib/domain/input-assist/types";
import { buildTeamApiPath } from "@/lib/domain/team";

// 「AI に骨組みを頼む」:依頼の状態を見る(待ち・解析中のあいだは 5 秒ごと、それ以外は 30 秒ごと)。
// セットができるたびに(途中の結果)、ラリーが空のセットにはサーバーが自動で入れる(4 秒ごとの同期で、この画面にも入る)。
// ラリーが入っていたセットは、ここで「入れ替える」を押したときだけ入れる。

const ACTIVE_POLL_MS = 5 * 1000;
const IDLE_POLL_MS = 30 * 1000;

export function useAiJobs(sessionId: string, teamSlug: string) {
  const [jobs, setJobs] = useState<IaAiJobSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = jobs?.[0] ?? null;
  const active = latest?.status === "pending" || latest?.status === "running";
  const url = buildTeamApiPath(`/api/input-assist/sessions/${sessionId}/ai-jobs`, teamSlug);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { jobs?: IaAiJobSummary[] } | null;
      if (response.ok && payload?.jobs) {
        setJobs(payload.jobs);
      }
    } catch {
      // 次の回にまた見る
    }
  }, [url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  /** 依頼を作る。beforeRequest で、準備を先に保存しておく。 */
  const request = useCallback(
    async (beforeRequest: () => Promise<boolean>) => {
      setError("");
      setBusy(true);
      try {
        if (!(await beforeRequest())) {
          setError("準備を保存できませんでした。保存してから、もう一度押してください。");
          return;
        }
        const response = await fetch(url, { method: "POST" });
        const payload = (await response.json().catch(() => null)) as { job?: IaAiJobSummary; error?: string } | null;
        if (!response.ok || !payload?.job) {
          setError(payload?.error ?? "頼めませんでした。");
          return;
        }
        const job = payload.job;
        setJobs((current) => [job, ...(current ?? [])]);
      } catch {
        setError("頼めませんでした。通信を確かめてください。");
      } finally {
        setBusy(false);
      }
    },
    [url],
  );

  return { jobs, latest, active, error, busy, request, refresh };
}

/**
 * セットごとの状態(画面に出す形):待ち / 解析中 / できた / 入れた / 入れ替え待ち / 失敗。
 * サーバーの状態に、この画面の試合の中身を合わせる(「入れ替える」「入れる」を押したセットは 入れた)。
 * action:入れ替える(ラリーが入っている)・入れる(ラリーが空)。押せないときは null。
 */
export type SkeletonSetState = {
  setIndex: number;
  state: IaAiSetState;
  rallyCount: number | null;
  action: "replace" | "insert" | null;
};

export function skeletonSetStates(
  job: IaAiJobSummary | null,
  session: Pick<InputAssistSession, "sets">,
): SkeletonSetState[] {
  if (!job) {
    return [];
  }
  const output: SkeletonSetState[] = [];
  for (const entry of job.setStates ?? []) {
    const set = session.sets.find((candidate) => candidate.setIndex === entry.setIndex && !candidate.skipped);
    if (!set) {
      continue;
    }
    const hasSkeleton = Boolean(job.skeleton?.rallies.some((rally) => rally.set === entry.setIndex));
    if (!hasSkeleton) {
      output.push({ ...entry, action: null });
      continue;
    }
    const applied =
      hasSkeletonApplied(set.rallies, job.id, entry.setIndex) ||
      // サーバーが入れたが、この画面にはまだ届いていない(4 秒ごとの同期を待つ)
      (entry.state === "applied" && set.rallies.length === 0);
    if (applied) {
      output.push({ ...entry, state: "applied", action: null });
    } else if (set.rallies.length > 0) {
      output.push({ ...entry, state: "waiting", action: "replace" });
    } else {
      output.push({ ...entry, state: "done", action: "insert" });
    }
  }
  return output;
}

/** 依頼の状態を一行に。セットごとの状態があれば「2セット目 できた・3セット目 解析中」、なければ「解析中 45%」など。 */
export function describeAiJobLine(job: IaAiJobSummary, states: SkeletonSetState[]): string {
  if (job.status === "pending" || job.status === "failed" || states.length === 0) {
    return describeAiJob(job);
  }
  const text = describeAiSetStates(states);
  if (!text) {
    return describeAiJob(job);
  }
  const percent = job.status === "running" && typeof job.progressPercent === "number" ? `(全体 ${Math.round(job.progressPercent)}%)` : "";
  return `${text}${percent}`;
}

/** 準備のタブに出す:「AI に骨組みを頼む」と状態。 */
export function IaAiJobPanel({
  session,
  jobs,
  onRequest,
  onApply,
}: {
  session: Pick<InputAssistSession, "sets">;
  jobs: ReturnType<typeof useAiJobs>;
  onRequest: () => void;
  onApply: (job: IaAiJobSummary, setIndex: number) => void;
}) {
  const { latest, active, error, busy } = jobs;
  const states = skeletonSetStates(latest, session);
  const previous = useRef<{ id: string; status: string; applied: number[] } | null>(null);
  const [notice, setNotice] = useState("");

  // この画面を開いている間に、セットが入った・全部できたら、一度だけ知らせる
  useEffect(() => {
    const before = previous.current;
    const applied = latest?.applied?.applied ?? [];
    previous.current = latest ? { id: latest.id, status: latest.status, applied } : null;
    if (!latest || before?.id !== latest.id) {
      return;
    }
    const added = applied.filter((setIndex) => !before.applied.includes(setIndex));
    if (latest.status === "done" && before.status !== "done") {
      setNotice(applied.length > 0 ? `骨組みができました。${applied.join("・")}セット目に入れました。` : "骨組みができました。");
    } else if (added.length > 0) {
      setNotice(`${added.join("・")}セット目の骨組みができたので、入れました。打ち始められます。`);
    }
  }, [latest]);

  return (
    <section className="soft-panel stack">
      <h3 className="ia-subheading">AI の骨組み</h3>
      <p className="muted ia-note">
        セットごとの YouTube の URL・開始時刻・最終スコアから、AI がラリーの区切りとサーブの向きを作ります(30 分〜1 時間ほど)。
        ラリーが空のセットには、できたら自動で入ります。
      </p>
      <div className="ia-inline-form">
        <button type="button" className="button" onClick={onRequest} disabled={busy || active}>
          {busy ? "頼んでいます…" : "AI に骨組みを頼む"}
        </button>
        {latest ? (
          <span className={`ia-ai-status ia-ai-status-${latest.status}`} role="status">
            {describeAiJob(latest)}
          </span>
        ) : null}
      </div>
      {error ? <p className="ia-error">{error}</p> : null}
      {notice ? <p className="ia-message">{notice}</p> : null}
      {states.length > 0 ? (
        <ul className="ia-ai-sets">
          {states.map((entry) => (
            <li key={entry.setIndex}>
              <span>
                {entry.setIndex}セット目
                {entry.rallyCount !== null ? `(骨組み ${entry.rallyCount} 本)` : ""}
              </span>
              <span className={`ia-ai-set-state ia-ai-set-state-${entry.state}`}>{AI_SET_STATE_LABELS[entry.state]}</span>
              {entry.action ? (
                <button type="button" className="button secondary" onClick={() => latest && onApply(latest, entry.setIndex)}>
                  {entry.action === "replace" ? "入れ替える" : "入れる"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** 担当の表の下に出す、短い状態(「AI:2セット目 できた・3セット目 解析中」)。 */
export function IaAiJobStatusLine({
  job,
  session,
  onOpen,
}: {
  job: IaAiJobSummary | null;
  session: Pick<InputAssistSession, "sets">;
  onOpen: () => void;
}) {
  if (!job) {
    return null;
  }
  return (
    <p className="muted ia-note ia-ai-line">
      AI:<span className={`ia-ai-status ia-ai-status-${job.status}`}>{describeAiJobLine(job, skeletonSetStates(job, session))}</span>{" "}
      <button type="button" className="ia-link-button" onClick={onOpen}>
        準備で見る
      </button>
    </p>
  );
}
