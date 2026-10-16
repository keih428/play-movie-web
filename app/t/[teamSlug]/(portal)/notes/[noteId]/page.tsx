import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteComments } from "@/components/note-comments";
import { NoteDeleteButton } from "@/components/note-delete-button";
import { RefreshOnMount } from "@/components/refresh-on-mount";
import { formatNoteDate } from "@/lib/domain/notes";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { getNote, getUnreadCounts, listComments, markNoteSeen } from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
    noteId: string;
  }>;
};

export const dynamic = "force-dynamic";

/** 1つのノートと、そのコメント。書いた本人が開くと、新着のコメントは読んだことになる。 */
export default async function TeamNotePage({ params }: PageProps) {
  const { teamSlug, noteId } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamNotesPath(teamSlug);
  const current = await requireMember(teamSlug, `${basePath}/${noteId}`);
  const note = await getNote(teamSlug, noteId);
  if (!note) {
    notFound();
  }

  const isAuthor = note.memberId === current.id;
  const comments = await listComments([note.id]);
  // 未読のコメントがあれば読んだことにし、開いたあとで上のメニューの新着の数を消す。
  const hadUnread = isAuthor && ((await getUnreadCounts(current.id))[note.id] ?? 0) > 0;
  if (isAuthor) {
    await markNoteSeen(note.id, current.id);
  }

  return (
    <>
      {hadUnread ? <RefreshOnMount /> : null}
      <header className="tp-hero">
        <span className="tp-eyebrow">
          {note.practiceDate.slice(0, 4)}年 {formatNoteDate(note.practiceDate)}
        </span>
        <h1>{note.memberName}のノート</h1>
        <div className="tp-chips">
          {note.position ? <span className="tp-chip">{note.position}</span> : null}
        </div>
        <div className="tp-actions">
          <Link
            className="tp-button tp-ghost"
            href={note.group ? `${basePath}?feed=${note.group}` : basePath}
          >
            一覧に戻る
          </Link>
          {isAuthor ? (
            <Link className="tp-button tp-ghost" href={`${basePath}/write?date=${note.practiceDate}`}>
              直す
            </Link>
          ) : null}
          {isAuthor || canAdminister(current) ? (
            <NoteDeleteButton
              noteId={note.id}
              redirectTo={isAuthor ? `${basePath}/mine` : basePath}
              teamSlug={teamSlug}
            />
          ) : null}
        </div>
      </header>

      <article className="tp-card tp-notecard">
        <p className="tp-note-body">{note.body}</p>
        {note.request ? (
          <p className="tp-request">
            <b>リーダーへ</b>
            {note.request}
          </p>
        ) : null}
      </article>

      <NoteComments initialComments={comments} noteId={note.id} teamSlug={teamSlug} />
    </>
  );
}
