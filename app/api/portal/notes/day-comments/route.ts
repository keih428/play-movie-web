import { NextRequest, NextResponse } from "next/server";
import { NOTE_COMMENT_MAX, getLastNoteDate, isIsoDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { getMember } from "@/lib/server/portal-member-store";
import { postNoteComment } from "@/lib/server/portal-note-comment";
import { ensureNote, listComments } from "@/lib/server/portal-note-store";
import { readPhotoIds } from "@/lib/domain/note-media";
import { keepAllowedPhotoIds } from "@/lib/server/portal-photo-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { getBaseUrl } from "@/lib/server/portal-slack";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

// 部員の、その練習日のノートにコメントする(2026-10-26 から)。まだ書いていない日でもよい。
// ノートがなければ本文が空のノートを作ってコメントを付ける。本人があとで書くと、コメントはそのまま残る。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as { memberId?: unknown; date?: unknown; body?: unknown; photoIds?: unknown };
  const target = typeof payload.memberId === "string" ? await getMember(payload.memberId) : null;
  // ノートを書くのは、ポジションのある部員だけ(スタッフのノートはない)。
  if (!target || target.teamSlug !== teamSlug || !target.active || !target.position) {
    return NextResponse.json({ error: "部員が見つかりません。" }, { status: 404 });
  }
  if (!isIsoDate(payload.date) || payload.date > getLastNoteDate(getTodayInJapan())) {
    return NextResponse.json({ error: "日付が正しくありません。" }, { status: 400 });
  }
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, NOTE_COMMENT_MAX) : "";
  // 写真だけのコメントもよい(2026-11-20 から)。
  const photoIds = await keepAllowedPhotoIds(teamSlug, current.id, readPhotoIds(payload.photoIds) ?? []);
  if (!body && photoIds.length === 0) {
    return NextResponse.json({ error: "コメントを書くか、写真を付けてください。" }, { status: 400 });
  }

  const note = await ensureNote(target, payload.date);
  await postNoteComment({ teamSlug, note, current, body, photoIds, baseUrl: getBaseUrl(request) });
  return NextResponse.json({ noteId: note.id, comments: await listComments([note.id]) });
}
