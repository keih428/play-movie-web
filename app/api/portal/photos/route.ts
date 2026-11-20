import { NextRequest, NextResponse } from "next/server";
import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from "@/lib/domain/note-media";
import { isPortalTeam } from "@/lib/domain/portal";
import { savePhoto } from "@/lib/server/portal-photo-store";
import { getCurrentMember } from "@/lib/server/portal-session";

// ノート・コメントに付ける写真を1枚上げる(2026-11-20 から)。端末で縮めてから送る。
// 上げただけではどこにも出ない。ノート・コメントを保存するときに、返した ID を photoIds に入れる。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "写真がありません。" }, { status: 400 });
  }
  if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "写真(JPEG・PNG・WebP)を選んでください。" }, { status: 400 });
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "写真が大きすぎます。" }, { status: 413 });
  }

  const id = await savePhoto({
    teamSlug,
    uploaderId: current.id,
    bytes: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
  });
  return NextResponse.json({ id });
}
