import { NextRequest, NextResponse } from "next/server";
import { NOTE_COMMENT_MAX, formatNoteDate, pickCommentRecipients } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { listMembers } from "@/lib/server/portal-member-store";
import {
  addComment,
  getNote,
  listCommenterIds,
  listComments,
} from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { excerpt, getBaseUrl, notifyMembers } from "@/lib/server/portal-slack";

type RouteContext = {
  params: Promise<{
    noteId: string;
  }>;
};

// コメントは、部員もスタッフも書ける。付いたら、ノートを書いた本人と、
// そのノートにコメントしたことのある人みんなに知らせる(Slack のスレッドと同じ)。
export async function POST(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { noteId } = await context.params;
  const note = await getNote(teamSlug, noteId);
  if (!note) {
    return NextResponse.json({ error: "ノートが見つかりません。" }, { status: 404 });
  }

  const payload = (await request.json()) as { body?: unknown };
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, NOTE_COMMENT_MAX) : "";
  if (!body) {
    return NextResponse.json({ error: "コメントを書いてください。" }, { status: 400 });
  }

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
    const tail = `\n> ${excerpt(body)}\n${getBaseUrl(request)}${buildTeamNotesPath(teamSlug)}/${note.id}`;
    await Promise.all([
      notifyMembers(
        members.filter((member) => member.id === recipients.author),
        `${current.displayName} が ${noteDate} のノートにコメントしました${tail}`,
      ),
      notifyMembers(
        members.filter((member) => recipients.participants.includes(member.id)),
        `${current.displayName} が、あなたがコメントした ${owner} ${noteDate} のノートに返信しました${tail}`,
      ),
    ]);
  }

  return NextResponse.json({ comments: await listComments([note.id]) });
}
