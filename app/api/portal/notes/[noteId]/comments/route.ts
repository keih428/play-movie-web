import { NextRequest, NextResponse } from "next/server";
import { NOTE_COMMENT_MAX, formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { getMember } from "@/lib/server/portal-member-store";
import { addComment, getNote, listComments } from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { excerpt, getBaseUrl, notifyMembers } from "@/lib/server/portal-slack";

type RouteContext = {
  params: Promise<{
    noteId: string;
  }>;
};

// コメントは、部員もスタッフも書ける。付いたら、ノートを書いた本人に知らせる。
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

  await addComment(note.id, current.id, body);

  if (note.memberId !== current.id) {
    const author = await getMember(note.memberId);
    if (author?.active) {
      await notifyMembers(
        [author],
        `${current.name} が ${formatNoteDate(note.practiceDate)} のノートにコメントしました\n> ${excerpt(body)}\n${getBaseUrl(request)}${buildTeamNotesPath(teamSlug)}/${note.id}`,
      );
    }
  }

  return NextResponse.json({ comments: await listComments([note.id]) });
}
