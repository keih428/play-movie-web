import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam } from "@/lib/domain/portal";
import { readPhoto } from "@/lib/server/portal-photo-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    photoId: string;
  }>;
};

// ノート・コメントの写真を出す。見られるのはログインした部員だけ(ノートと同じ)。写真は変わらないので、端末に長く残す。
export async function GET(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { photoId } = await context.params;
  const photo = await readPhoto(teamSlug, photoId);
  if (!photo) {
    return NextResponse.json({ error: "写真が見つかりません。" }, { status: 404 });
  }
  return new NextResponse(photo.body as BodyInit, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
