"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { NoteComments } from "@/components/note-comments";
import { NOTE_BODY_MAX, NOTE_REQUEST_MAX, formatNoteDate, type Note, type NoteComment } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";

type NoteCardProps = {
  note: Note;
  comments: NoteComment[];
  // 書いた本人は、編集と削除ができる。
  isMine: boolean;
  // トレーニング担当は、ほかの人のノートも削除できる。
  canDelete: boolean;
  // 今週、自分がコメント当番で受け持っている人のノート。
  isDutyTarget?: boolean;
  teamSlug: string;
  unread?: number;
};

// 一覧で並べるアイコンの数(それより多い人は「+2」のようにまとめる)。
const AVATAR_LIMIT = 5;

/**
 * 一覧に出す1つぶんのノート。コメントは、その場で開いて読み書きできる。誰がコメントしているかは、背番号のアイコンで並べる。
 * 編集・削除も、右上の「…」からその場でできる(けーいちの決定、2026-10-20:ノートのページへ移らなくてよいように)。
 */
export function NoteCard({
  note: initialNote,
  comments: initialComments,
  isMine,
  canDelete,
  isDutyTarget = false,
  teamSlug,
  unread = 0,
}: NoteCardProps) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [unreadLeft, setUnreadLeft] = useState(unread);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "delete" | "deleted">("view");
  const [body, setBody] = useState(note.body);
  const [request, setRequest] = useState(note.request);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  // 本文が途中で切れているか(長い本文は途中までにして、「全文を表示」で開く)。表示の高さで決める。
  const [isLong, setIsLong] = useState(false);

  useEffect(() => {
    const element = bodyRef.current;
    if (element && !expanded) {
      setIsLong(element.scrollHeight > element.clientHeight + 1);
    }
  }, [note.body, expanded, mode]);

  // メニューの外を押したら閉じる。
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  // コメントした人(重なりなし、最初にコメントした順)。
  const commenters = comments.filter(
    (comment, index) => comments.findIndex((entry) => entry.memberId === comment.memberId) === index,
  );
  const hasMenu = isMine || canDelete;

  function toggleComments() {
    const next = !open;
    setOpen(next);
    // 自分のノートの新着を開いたら、読んだことにして、上のメニューの新着の数も消す。
    if (next && isMine && unreadLeft > 0) {
      setUnreadLeft(0);
      void fetch(buildTeamApiPath(`/api/portal/notes/${note.id}/seen`, teamSlug), { method: "POST" }).then(() =>
        router.refresh(),
      );
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/notes", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: note.practiceDate, body, request }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存できませんでした。もう一度試してください。");
      }
      setNote({ ...note, body: body.trim(), request: request.trim() });
      setMode("view");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath(`/api/portal/notes/${note.id}`, teamSlug), { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "削除できませんでした。もう一度試してください。");
      }
      setMode("deleted");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "削除できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "deleted") {
    return <p className="tp-message">{formatNoteDate(note.practiceDate)}のノートを削除しました。</p>;
  }

  return (
    <article className="tp-card tp-notecard">
      <div className="tp-dayhead">
        <span className="tp-when">{formatNoteDate(note.practiceDate)}</span>
        <span className="tp-what">{note.memberName}</span>
        <span className="tp-time">{note.position ?? ""}</span>
        {isDutyTarget ? <span className="tp-duty-badge">当番</span> : null}
        {hasMenu && mode === "view" ? (
          <div className="tp-kebab" ref={menuRef}>
            <button
              type="button"
              className="tp-kebab-button"
              aria-label="ノートのメニュー"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              …
            </button>
            {menuOpen ? (
              <div className="tp-kebab-menu" role="menu">
                {isMine ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setBody(note.body);
                      setRequest(note.request);
                      setMode("edit");
                      setMenuOpen(false);
                    }}
                  >
                    編集
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="tp-kebab-danger"
                  onClick={() => {
                    setMode("delete");
                    setMenuOpen(false);
                  }}
                >
                  削除
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === "edit" ? (
        <div className="tp-note-edit">
          <div className="tp-field">
            <label htmlFor={`note-body-${note.id}`}>練習で気付いたこと・次にやること</label>
            <textarea
              id={`note-body-${note.id}`}
              rows={6}
              maxLength={NOTE_BODY_MAX}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div className="tp-field">
            <label htmlFor={`note-request-${note.id}`}>リーダーへ(反応してほしいこと。なければ空のまま)</label>
            <textarea
              id={`note-request-${note.id}`}
              rows={2}
              maxLength={NOTE_REQUEST_MAX}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
            />
          </div>
          <div className="tp-actions">
            <button type="button" className="tp-button" disabled={busy || !body.trim()} onClick={save}>
              {busy ? "保存中…" : "保存"}
            </button>
            <button type="button" className="tp-button tp-ghost" disabled={busy} onClick={() => setMode("view")}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <>
          <p ref={bodyRef} className={`tp-note-body${expanded ? "" : " tp-note-clamp"}`}>
            {note.body}
          </p>
          {isLong ? (
            <button type="button" className="tp-note-expand" onClick={() => setExpanded(!expanded)}>
              {expanded ? "たたむ" : "全文を表示"}
            </button>
          ) : null}
          {note.request ? (
            <p className="tp-request">
              <b>リーダーへ</b>
              {note.request}
            </p>
          ) : null}
        </>
      )}

      {mode === "delete" ? (
        <div className="tp-note-delete">
          <p className="tp-small">このノートを削除します。付いているコメントも消えて、元に戻せません。</p>
          <div className="tp-actions">
            <button type="button" className="tp-button tp-danger" disabled={busy} onClick={remove}>
              {busy ? "削除中…" : "削除する"}
            </button>
            <button type="button" className="tp-button tp-ghost" disabled={busy} onClick={() => setMode("view")}>
              やめる
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      {mode === "view" ? (
        <div className="tp-note-foot">
          <button type="button" className="tp-note-toggle" aria-expanded={open} onClick={toggleComments}>
            {commenters.length > 0 ? (
              <span className="tp-avatars" aria-hidden="true">
                {commenters.slice(0, AVATAR_LIMIT).map((comment) => (
                  <MemberAvatar key={comment.memberId} name={comment.memberName} number={comment.memberNumber} />
                ))}
                {commenters.length > AVATAR_LIMIT ? (
                  <span className="tp-avatar tp-avatar-more">+{commenters.length - AVATAR_LIMIT}</span>
                ) : null}
              </span>
            ) : null}
            <span>{comments.length > 0 ? `コメント ${comments.length}件` : "コメントする"}</span>
            {unreadLeft > 0 ? <span className="tp-unread">新着 {unreadLeft}</span> : null}
            <span className="tp-note-chevron" aria-hidden="true">
              {open ? "▲" : "▼"}
            </span>
          </button>
        </div>
      ) : null}
      {open && mode === "view" ? (
        <NoteComments
          compact
          initialComments={comments}
          noteId={note.id}
          teamSlug={teamSlug}
          onChange={setComments}
        />
      ) : null}
    </article>
  );
}
