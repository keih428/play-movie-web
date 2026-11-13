import { findMentionedIds, listThreadParticipantIds } from "@/lib/domain/mentions";
import { formatNoteDate, pickCommentRecipients, type Note } from "@/lib/domain/notes";
import type { Member } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { listMembers } from "@/lib/server/portal-member-store";
import { addComment, listComments } from "@/lib/server/portal-note-store";
import { excerpt, notifyMembers } from "@/lib/server/portal-slack";

/**
 * ノートにコメントを付けて、ノートを書いた本人と、そのノートにコメントしたことのある人(と @ で呼ばれたことのある人)
 * みんなに知らせる(Slack のスレッドと同じ)。このコメントで @ で呼ばれた人には「呼ばれた」と知らせる(2026-11-13 から)。
 * コメントの API と、書いていない日へのコメントの API で共通。
 */
export async function postNoteComment(input: {
  teamSlug: string;
  note: Note;
  current: Member;
  body: string;
  baseUrl: string;
}) {
  const { teamSlug, note, current, body, baseUrl } = input;
  // 名簿から外れた人には送らない(listMembers は名簿に載っている人だけを返す)。
  const members = await listMembers(teamSlug);
  // 知らせる相手は、このコメントが入る前の顔ぶれで決める。
  const previous = await listComments([note.id]);
  const recipients = pickCommentRecipients({
    authorId: note.memberId,
    commenterIds: listThreadParticipantIds(
      previous.map((comment) => ({ authorId: comment.memberId, body: comment.body })),
      members,
    ),
    senderId: current.id,
  });
  // 呼ばれた人は「呼ばれた」の知らせだけにする(本人・参加者と2通にならないように)。
  const mentionedIds = findMentionedIds(body, members).filter((memberId) => memberId !== current.id);

  await addComment(note.id, current.id, body);

  const noteDate = formatNoteDate(note.practiceDate);
  // 書いた本人が返したときは「佐藤 が、あなたがコメントした 佐藤 の…」とならないようにする。
  const owner = note.memberId === current.id ? "自分の" : `${note.memberName} の`;
  const tail = `\n> ${excerpt(body)}\n${baseUrl}${buildTeamNotesPath(teamSlug)}/${note.id}`;
  // まだ書いていない日へのコメントは、本人にそう伝える。
  const authorText = note.body.trim()
    ? `${current.displayName} が ${noteDate} のノートにコメントしました${tail}`
    : `${current.displayName} が、まだ書いていない ${noteDate} のノートにコメントしました${tail}`;
  const pick = (ids: string[]) =>
    members.filter((member) => ids.includes(member.id) && !mentionedIds.includes(member.id));
  await Promise.all([
    notifyMembers(pick(recipients.author ? [recipients.author] : []), authorText),
    notifyMembers(
      pick(recipients.participants),
      `${current.displayName} が、あなたがコメントした ${owner} ${noteDate} のノートに返信しました${tail}`,
    ),
    notifyMembers(
      members.filter((member) => mentionedIds.includes(member.id)),
      `${current.displayName} が、${owner} ${noteDate} のノートのコメントで、あなたを呼んでいます${tail}`,
    ),
  ]);
}
