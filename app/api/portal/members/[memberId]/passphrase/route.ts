import { NextRequest, NextResponse } from "next/server";
import { canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { setMemberPassphraseHash } from "@/lib/server/portal-member-store";
import {
  SESSION_COOKIE,
  createSessionValue,
  getCookieOptions,
  getCurrentMember,
} from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    memberId: string;
  }>;
};

// 部員が自分の合言葉を忘れたとき、システム担当が消す(2026-10-25 から)。
// 消すとその人はログインし直しになり、次は名前を選ぶだけで入れる(入ったあとで決め直してもらう)。
export async function DELETE(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current || !canManageSite(current)) {
    return NextResponse.json({ error: "名簿を変える権限がありません。" }, { status: 403 });
  }

  const { memberId } = await context.params;
  const member = await setMemberPassphraseHash(teamSlug, memberId, null);
  if (!member) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }
  const response = NextResponse.json({ member });
  // 自分の分を消したときは、この端末のログインはそのままにする。
  if (member.id === current.id) {
    response.cookies.set(SESSION_COOKIE, createSessionValue(member), getCookieOptions());
  }
  return response;
}
