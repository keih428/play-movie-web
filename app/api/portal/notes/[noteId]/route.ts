import { NextRequest, NextResponse } from "next/server";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { deleteNote, getNote } from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    noteId: string;
  }>;
};

// ノートを消す(付いているコメントも一緒に消える)。消せるのは、書いた本人とトレーニング担当。
export async function DELETE(request: NextRequest, context: RouteContext) {
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
  if (note.memberId !== current.id && !canAdminister(current)) {
    return NextResponse.json({ error: "このノートを消す権限がありません。" }, { status: 403 });
  }

  await deleteNote(note.id);
  return NextResponse.json({ ok: true });
}
