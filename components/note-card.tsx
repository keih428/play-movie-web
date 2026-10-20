"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { NoteComments } from "@/components/note-comments";
import { formatNoteDate, type Note, type NoteComment } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";

type NoteCardProps = {
  href: string;
  note: Note;
  comments: NoteComment[];
  isMine: boolean;
  teamSlug: string;
  unread?: number;
};

// 一覧で並べるアイコンの数(それより多い人は「+2」のようにまとめる)。
const AVATAR_LIMIT = 5;

/**
 * 一覧に出す1つぶんのノート。長い本文は途中までにして、続きは開いて読む。
 * コメントは、その場で開いて読み書きできる。誰がコメントしているかは、背番号のアイコンで並べる(部員の声、2026-10-20)。
 */
export function NoteCard({ href, note, comments: initialComments, isMine, teamSlug, unread = 0 }: NoteCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [unreadLeft, setUnreadLeft] = useState(unread);

  // コメントした人(重なりなし、最初にコメントした順)。
  const commenters = comments.filter(
    (comment, index) => comments.findIndex((entry) => entry.memberId === comment.memberId) === index,
  );

  function toggle() {
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

  return (
    <article className="tp-card tp-notecard">
      <div className="tp-dayhead">
        <span className="tp-when">{formatNoteDate(note.practiceDate)}</span>
        <span className="tp-what">{note.memberName}</span>
        <span className="tp-time">{note.position ?? ""}</span>
      </div>
      <p className="tp-note-body tp-note-clamp">{note.body}</p>
      {note.request ? (
        <p className="tp-request">
          <b>リーダーへ</b>
          {note.request}
        </p>
      ) : null}
      <div className="tp-note-foot">
        <button type="button" className="tp-note-toggle" aria-expanded={open} onClick={toggle}>
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
        <Link className="tp-note-more" href={href}>
          開く<span aria-hidden="true"> →</span>
        </Link>
      </div>
      {open ? (
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
