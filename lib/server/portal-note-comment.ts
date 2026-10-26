import { formatNoteDate, pickCommentRecipients, type Note } from "@/lib/domain/notes";
import type { Member } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { listMembers } from "@/lib/server/portal-member-store";
import { addComment, listCommenterIds } from "@/lib/server/portal-note-store";
import { excerpt, notifyMembers } from "@/lib/server/portal-slack";

/**
 * ノートにコメントを付けて、ノートを書いた本人と、そのノートにコメントしたことのある人みんなに知らせる
 * (Slack のスレッドと同じ)。コメントの API と、書いていない日へのコメントの API で共通。
 */
export async function postNoteComment(input: {
  teamSlug: string;
  note: Note;
  current: Member;
  body: string;
  baseUrl: string;
}) {
  const { teamSlug, note, current, body, baseUrl } = input;
  // 知らせる相手は、このコメントが入る前の顔ぶれで決める。
  const recipients = pickCommentRecipients({
    authorId: note.memberId,
    commenterIds: await listCommenterIds(note.id),
    senderId: current.id,
  });

  await addComment(note.id, current.id, body);

  if (recipients.author || recipients.participants.length > 0) {
    // 名簿から外れた人には送らない(listMembers は名簿に載っている人だけを返す)。
    const members = await listMembers(teamSlug);
    const noteDate = formatNoteDate(note.practiceDate);
    // 書いた本人が返したときは「佐藤 が、あなたがコメントした 佐藤 の…」とならないようにする。
    const owner = note.memberId === current.id ? "自分の" : `${note.memberName} の`;
    const tail = `\n> ${excerpt(body)}\n${baseUrl}${buildTeamNotesPath(teamSlug)}/${note.id}`;
    // まだ書いていない日へのコメントは、本人にそう伝える。
    const authorText = note.body.trim()
      ? `${current.displayName} が ${noteDate} のノートにコメントしました${tail}`
      : `${current.displayName} が、まだ書いていない ${noteDate} のノートにコメントしました${tail}`;
    await Promise.all([
      notifyMembers(
        members.filter((member) => member.id === recipients.author),
        authorText,
      ),
      notifyMembers(
        members.filter((member) => recipients.participants.includes(member.id)),
        `${current.displayName} が、あなたがコメントした ${owner} ${noteDate} のノートに返信しました${tail}`,
      ),
    ]);
  }
}
