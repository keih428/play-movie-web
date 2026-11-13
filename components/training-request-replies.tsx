"use client";

import { FormEvent, useEffect, useState } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { MentionText, MentionTextarea } from "@/components/mentions";
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

// 並べるアイコンの数(バレーノートと同じ)。
const AVATAR_LIMIT = 5;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 「トレーニング担当へ」の下に出す返信のやりとり。書けるのはトレーニング担当と、書いた本人と、@ で呼ばれた人(2026-11-13 から)。
 * 見た目はバレーノートのコメントにそろえた(2026-11-12 から。けーいちの依頼):下の「返信 N件 ▼」でその場で開き、
 * 返信した人を背番号のアイコンで並べる。Slack の知らせから来たとき(#req-…)は、開いた状態で出す。
 */
export function TrainingRequestReplies({
  canReply,
  initialReplies,
  memberId,
  sessionDate,
  teamSlug,
}: TrainingRequestRepliesProps) {
  const [replies, setReplies] = useState(initialReplies);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldId = `reply-${memberId}-${sessionDate}`;

  useEffect(() => {
    if (window.location.hash === `#req-${memberId}-${sessionDate}`) {
      setOpen(true);
    }
  }, [memberId, sessionDate]);

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

  // 返信した人(同じ人は1つ)。
  const authors = [...new Map(replies.map((reply) => [reply.authorId, reply])).values()];

  return (
    <>
      <div className="tp-note-foot">
        <button type="button" className="tp-note-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {authors.length > 0 ? (
            <span className="tp-avatars" aria-hidden="true">
              {authors.slice(0, AVATAR_LIMIT).map((reply) => (
                <MemberAvatar key={reply.authorId} name={reply.authorName} number={reply.authorNumber} />
              ))}
              {authors.length > AVATAR_LIMIT ? (
                <span className="tp-avatar tp-avatar-more">+{authors.length - AVATAR_LIMIT}</span>
              ) : null}
            </span>
          ) : null}
          <span>{replies.length > 0 ? `返信 ${replies.length}件` : "返信する"}</span>
          <span className="tp-note-chevron" aria-hidden="true">
            {open ? "▲" : "▼"}
          </span>
        </button>
      </div>
      {open ? (
        <section className="tp-comments-inline">
          {replies.length === 0 ? (
            <p className="tp-small tp-muted">まだ返信はありません。</p>
          ) : (
            <ol className="tp-comments">
              {replies.map((reply) => (
                <li key={reply.id}>
                  <div className="tp-comment-head">
                    <MemberAvatar name={reply.authorName} number={reply.authorNumber} />
                    <b>{reply.authorName}</b>
                    <span suppressHydrationWarning>{formatDateTime(reply.createdAt)}</span>
                  </div>
                  <p>
                    <MentionText text={reply.body} />
                  </p>
                </li>
              ))}
            </ol>
          )}
          {canReply ? (
            <form className="tp-comment-form" onSubmit={send}>
              <div className="tp-field">
                <label htmlFor={fieldId}>返信を書く</label>
                <MentionTextarea
                  id={fieldId}
                  rows={2}
                  maxLength={TRAINING_REPLY_MAX}
                  value={body}
                  onChange={setBody}
                />
                <p className="tp-small tp-muted">
                  書いた本人とトレーニング担当、ここに返信した人、@ で呼んだ人に Slack で知らせます。呼ばれた人もここに返信できます。
                </p>
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
        </section>
      ) : null}
    </>
  );
}
