import { NextRequest, NextResponse } from "next/server";
import { canManageMembers, isPortalTeam } from "@/lib/domain/portal";
import { validateMenu } from "@/lib/domain/training";
import { getCurrentMember } from "@/lib/server/portal-session";
import { saveTrainingMenu } from "@/lib/server/portal-training-store";

// メニューはリポジトリに置かず、`build.py --json` で作ったファイルをここから読み込ませる。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current || !canManageMembers(current.role)) {
    return NextResponse.json({ error: "メニューを変える権限がありません。" }, { status: 403 });
  }

  const menu = validateMenu(await request.json().catch(() => null));
  if (!menu) {
    return NextResponse.json(
      { error: "メニューのデータとして読めませんでした。`build.py --json` で作った menu.json を選んでください。" },
      { status: 400 },
    );
  }

  await saveTrainingMenu(teamSlug, menu, current.name);
  return NextResponse.json({ weeks: menu.weeks.length });
}
