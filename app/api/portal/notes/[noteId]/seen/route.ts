import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam } from "@/lib/domain/portal";
import { getNote, markNoteSeen } from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    noteId: string;
  }>;
};

// 一覧の中で自分のノートのコメントを開いたら、そこまでのコメントを「読んだ」ことにする(ノートのページを開いたときと同じ)。
export async function POST(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  const { noteId } = await context.params;
  const note = await getNote(teamSlug, noteId);
  if (!note || note.memberId !== current.id) {
    return NextResponse.json({ error: "自分のノートではありません。" }, { status: 404 });
  }
  await markNoteSeen(note.id, current.id);
  return NextResponse.json({ ok: true });
}
