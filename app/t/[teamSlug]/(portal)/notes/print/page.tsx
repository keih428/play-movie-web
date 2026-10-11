import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { formatNoteDate, type Note, type NoteComment } from "@/lib/domain/notes";
import {
  MEMBER_GROUPS,
  MEMBER_GROUP_LABELS,
  canExportNotes,
  isPortalTeam,
} from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { listMembers } from "@/lib/server/portal-member-store";
import { listComments, listNotes } from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    month?: string;
  }>;
};

export const dynamic = "force-dynamic";

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

/** その月のノートを、まとまり → 部員 → 日付の順に並べた印刷用のページ(コメントも入る)。 */
export default async function TeamNotesPrintPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamNotesPath(teamSlug);
  const current = await requireMember(teamSlug, `${basePath}/print`);
  if (!canExportNotes(current.role)) {
    redirect(basePath);
  }

  const { month: requestedMonth } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(requestedMonth ?? "")
    ? (requestedMonth as string)
    : getTodayInJapan().slice(0, 7);

  const [notes, members] = await Promise.all([listNotes(teamSlug, { month, limit: 5000 }), listMembers(teamSlug, { includeInactive: true })]);
  const comments = await listComments(notes.map((note) => note.id));
  const commentsByNote = new Map<string, NoteComment[]>();
  for (const comment of comments) {
    commentsByNote.set(comment.noteId, [...(commentsByNote.get(comment.noteId) ?? []), comment]);
  }
  const memberOrder = new Map(members.map((member, index) => [member.id, index]));

  // まとまりごとに、名簿の順で部員を並べ、その中は日付の古い順。
  const groups = MEMBER_GROUPS.map((group) => {
    const byMember = new Map<string, Note[]>();
    for (const note of notes.filter((entry) => entry.group === group)) {
      byMember.set(note.memberId, [...(byMember.get(note.memberId) ?? []), note]);
    }
    const authors = [...byMember.entries()]
      .sort(([left], [right]) => (memberOrder.get(left) ?? 0) - (memberOrder.get(right) ?? 0))
      .map(([, memberNotes]) =>
        memberNotes.sort((left, right) => left.practiceDate.localeCompare(right.practiceDate)),
      );
    return { group, authors };
  }).filter((entry) => entry.authors.length > 0);

  return (
    <>
      <header className="tp-hero tp-no-print">
        <span className="tp-eyebrow">トレーニング担当・スタッフ用</span>
        <h1>月ごとのまとめ</h1>
        <nav className="tp-weeks" aria-label="月">
          {[-2, -1, 0, 1].map((delta) => {
            const entry = shiftMonth(month, delta);
            return (
              <Link
                key={entry}
                href={`${basePath}/print?month=${entry}`}
                aria-current={delta === 0 ? "page" : undefined}
              >
                <b>{formatMonth(entry)}</b>
              </Link>
            );
          })}
        </nav>
        <p className="tp-small tp-muted">
          「印刷する」を押して、送り先を「PDF に保存」にすると PDF になる。{notes.length}件のノートが入る。
        </p>
        <div className="tp-actions">
          <PrintButton />
          <Link className="tp-button tp-ghost" href={basePath}>
            ノートに戻る
          </Link>
        </div>
      </header>

      <div className="tp-print">
        <h1 className="tp-print-title">バレーノート {formatMonth(month)}</h1>
        {groups.length === 0 ? <p className="tp-muted">この月のノートはありません。</p> : null}
        {groups.map(({ group, authors }) => (
          <section key={group} className="tp-print-group">
            <h2>{MEMBER_GROUP_LABELS[group]}</h2>
            {authors.map((memberNotes) => (
              <div key={memberNotes[0].memberId} className="tp-print-member">
                <h3>
                  {memberNotes[0].memberName}
                  <span className="tp-count">{memberNotes[0].position}</span>
                </h3>
                {memberNotes.map((note) => (
                  <article key={note.id} className="tp-print-note">
                    <h4>{formatNoteDate(note.practiceDate)}</h4>
                    <p className="tp-note-body">{note.body}</p>
                    {note.request ? (
                      <p className="tp-request">
                        <b>リーダーへ</b>
                        {note.request}
                      </p>
                    ) : null}
                    {(commentsByNote.get(note.id) ?? []).map((comment) => (
                      <p key={comment.id} className="tp-print-comment">
                        <b>{comment.memberName}</b>
                        {comment.body}
                      </p>
                    ))}
                  </article>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
