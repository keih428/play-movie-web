"use client";

import { FormEvent, useState } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { NOTE_COMMENT_MAX, type NoteComment } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";

type NoteCommentsProps = {
  initialComments: NoteComment[];
  noteId: string;
  teamSlug: string;
  // 一覧の中で開くとき:見出しを出さず、詰めて出す。コメントが増えたら親に知らせる。
  compact?: boolean;
  onChange?: (comments: NoteComment[]) => void;
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

export function NoteComments({ initialComments, noteId, teamSlug, compact = false, onChange }: NoteCommentsProps) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        buildTeamApiPath(`/api/portal/notes/${noteId}/comments`, teamSlug),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const payload = (await response.json()) as { error?: string; comments?: NoteComment[] };
      if (!response.ok || !payload.comments) {
        throw new Error(payload.error ?? "送れませんでした。もう一度試してください。");
      }
      setComments(payload.comments);
      onChange?.(payload.comments);
      setBody("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "送れませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={compact ? "tp-comments-inline" : "tp-section"}>
      {compact ? null : (
        <h2>
          コメント <span className="tp-count">{comments.length}件</span>
        </h2>
      )}
      {comments.length === 0 ? (
        <p className="tp-small tp-muted">まだコメントはありません。</p>
      ) : (
        <ol className="tp-comments">
          {comments.map((comment) => (
            <li key={comment.id}>
              <div className="tp-comment-head">
                <MemberAvatar name={comment.memberName} number={comment.memberNumber} />
                <b>{comment.memberName}</b>
                <span suppressHydrationWarning>{formatDateTime(comment.createdAt)}</span>
              </div>
              <p>{comment.body}</p>
            </li>
          ))}
        </ol>
      )}

      <form className={compact ? "tp-comment-form" : "tp-card"} onSubmit={send}>
        <div className="tp-field">
          <label htmlFor={`comment-body-${noteId}`}>コメントを書く</label>
          <textarea
            id={`comment-body-${noteId}`}
            rows={compact ? 2 : 3}
            maxLength={NOTE_COMMENT_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <p className="tp-small tp-muted">
            ノートを書いた人と、ここにコメントした人みんなに Slack で知らせます。
          </p>
        </div>
        {error ? (
          <p className="tp-error" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <button className="tp-button" type="submit" disabled={busy || !body.trim()}>
            {busy ? "送信中…" : "コメントする"}
          </button>
        </div>
      </form>
    </section>
  );
}
