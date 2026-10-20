"use client";

import { FormEvent, useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";
import { TRAINING_REPLY_MAX, type TrainingRequestReply } from "@/lib/domain/training";

type TrainingRequestRepliesProps = {
  canReply: boolean;
  initialReplies: TrainingRequestReply[];
  memberId: string;
  // 返信を付ける記録の日付。
  sessionDate: string;
  teamSlug: string;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 「トレーニング担当へ」の下に出す返信のやりとり。書けるのはトレーニング担当と、書いた本人。 */
export function TrainingRequestReplies({
  canReply,
  initialReplies,
  memberId,
  sessionDate,
  teamSlug,
}: TrainingRequestRepliesProps) {
  const [replies, setReplies] = useState(initialReplies);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldId = `reply-${memberId}-${sessionDate}`;

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/training/replies", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, sessionDate, body }),
      });
      const payload = (await response.json()) as { error?: string; replies?: TrainingRequestReply[] };
      if (!response.ok || !payload.replies) {
        throw new Error(payload.error ?? "送れませんでした。もう一度試してください。");
      }
      setReplies(payload.replies);
      setBody("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "送れませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (replies.length === 0 && !canReply) {
    return null;
  }

  return (
    <div className="tp-replies">
      {replies.length > 0 ? (
        <ol className="tp-comments">
          {replies.map((reply) => (
            <li key={reply.id}>
              <div className="tp-comment-head">
                <b>{reply.authorName}</b>
                <span suppressHydrationWarning>{formatDateTime(reply.createdAt)}</span>
              </div>
              <p>{reply.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {canReply ? (
        <form onSubmit={send} className="tp-reply-form">
          <div className="tp-field">
            <label htmlFor={fieldId}>返信する</label>
            <textarea
              id={fieldId}
              rows={2}
              maxLength={TRAINING_REPLY_MAX}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />
            <p className="tp-small tp-muted">書いた本人とトレーニング担当に Slack で知らせます。</p>
          </div>
          {error ? (
            <p className="tp-error" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <button className="tp-button" type="submit" disabled={busy || !body.trim()}>
              {busy ? "送信中…" : "返信する"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
