"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeAiJob,
  hasSkeletonApplied,
  type IaAiJobSummary,
} from "@/lib/domain/input-assist/ai-job";
import type { InputAssistSession } from "@/lib/domain/input-assist/types";
import { buildTeamApiPath } from "@/lib/domain/team";

// 「AI に骨組みを頼む」:依頼の状態を見る(待ち・解析中のあいだは 5 秒ごと、それ以外は 30 秒ごと)。
// できたら、ラリーが空のセットにはサーバーが自動で入れる(4 秒ごとの同期で、この画面にも入る)。
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

/** 骨組みのセットごとの状態:入れた・入れ替えられる・入れられる。 */
export type SkeletonSetState = { setIndex: number; state: "applied" | "replace" | "insert"; rallyCount: number };

export function skeletonSetStates(
  job: IaAiJobSummary | null,
  session: Pick<InputAssistSession, "sets">,
): SkeletonSetState[] {
  if (!job || job.status !== "done" || !job.skeleton) {
    return [];
  }
  const setIndexes = [...new Set(job.skeleton.rallies.map((rally) => rally.set))].sort((left, right) => left - right);
  const output: SkeletonSetState[] = [];
  for (const setIndex of setIndexes) {
    const set = session.sets.find((entry) => entry.setIndex === setIndex && !entry.skipped);
    if (!set) {
      continue;
    }
    const rallyCount = job.skeleton.rallies.filter((rally) => rally.set === setIndex).length;
    const applied =
      hasSkeletonApplied(set.rallies, job.id, setIndex) ||
      // サーバーが入れたが、この画面にはまだ届いていない(4 秒ごとの同期を待つ)
      (Boolean(job.applied?.applied.includes(setIndex)) && set.rallies.length === 0);
    output.push({ setIndex, state: applied ? "applied" : set.rallies.length > 0 ? "replace" : "insert", rallyCount });
  }
  return output;
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
  const previous = useRef<{ id: string; status: string } | null>(null);
  const [notice, setNotice] = useState("");

  // この画面を開いている間にできたら、一度だけ知らせる
  useEffect(() => {
    const before = previous.current;
    previous.current = latest ? { id: latest.id, status: latest.status } : null;
    if (latest?.status === "done" && before?.id === latest.id && before.status !== "done") {
      const applied = latest.applied?.applied ?? [];
      setNotice(applied.length > 0 ? `骨組みができました。${applied.join("・")}セット目に入れました。` : "骨組みができました。");
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
                {entry.setIndex}セット目(骨組み {entry.rallyCount} 本)
              </span>
              {entry.state === "applied" ? (
                <span className="ia-checked">入れました</span>
              ) : (
                <button type="button" className="button secondary" onClick={() => latest && onApply(latest, entry.setIndex)}>
                  {entry.state === "replace" ? "入れ替える" : "入れる"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** 担当の表の下に出す、短い状態。 */
export function IaAiJobStatusLine({ job, onOpen }: { job: IaAiJobSummary | null; onOpen: () => void }) {
  if (!job) {
    return null;
  }
  return (
    <p className="muted ia-note ia-ai-line">
      AI の骨組み:<span className={`ia-ai-status ia-ai-status-${job.status}`}>{describeAiJob(job)}</span>{" "}
      <button type="button" className="ia-link-button" onClick={onOpen}>
        準備で見る
      </button>
    </p>
  );
}
