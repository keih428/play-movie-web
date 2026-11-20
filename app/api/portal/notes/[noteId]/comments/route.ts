import { NextRequest, NextResponse } from "next/server";
import { NOTE_COMMENT_MAX } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { postNoteComment } from "@/lib/server/portal-note-comment";
import { getNote, listComments } from "@/lib/server/portal-note-store";
import { readPhotoIds } from "@/lib/domain/note-media";
import { keepAllowedPhotoIds } from "@/lib/server/portal-photo-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { getBaseUrl } from "@/lib/server/portal-slack";

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

  const payload = (await request.json()) as { body?: unknown; photoIds?: unknown };
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, NOTE_COMMENT_MAX) : "";
  // 写真だけのコメントもよい(2026-11-20 から)。
  const photoIds = await keepAllowedPhotoIds(teamSlug, current.id, readPhotoIds(payload.photoIds) ?? []);
  if (!body && photoIds.length === 0) {
    return NextResponse.json({ error: "コメントを書くか、写真を付けてください。" }, { status: 400 });
  }

  await postNoteComment({ teamSlug, note, current, body, photoIds, baseUrl: getBaseUrl(request) });

  return NextResponse.json({ comments: await listComments([note.id]) });
}
