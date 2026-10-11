import Link from "next/link";
import { formatNoteDate, type Note } from "@/lib/domain/notes";

type NoteCardProps = {
  href: string;
  note: Note;
  unread?: number;
};

/** 一覧に出す1つぶんのノート。長い本文は途中までにして、続きは開いて読む。 */
export function NoteCard({ href, note, unread = 0 }: NoteCardProps) {
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
      <Link className="tp-note-more" href={href}>
        {note.commentCount > 0 ? `コメント ${note.commentCount}件` : "開いてコメントする"}
        {unread > 0 ? <span className="tp-unread">新着 {unread}</span> : null}
        <span aria-hidden="true"> →</span>
      </Link>
    </article>
  );
}
