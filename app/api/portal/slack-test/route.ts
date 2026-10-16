import { NextRequest, NextResponse } from "next/server";
import { canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { getCurrentMember } from "@/lib/server/portal-session";
import { checkSlack } from "@/lib/server/portal-slack";

// システム担当が、自分あてにテストの DM を送って、届かない理由を調べる。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current || !canManageSite(current)) {
    return NextResponse.json({ error: "テストできるのはシステム担当だけです。" }, { status: 403 });
  }

  return NextResponse.json({ checks: await checkSlack(current) });
}
