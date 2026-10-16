import { NextRequest, NextResponse } from "next/server";
import { isIsoDate } from "@/lib/domain/notes";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { setPracticeDayOverride } from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";

// 練習日の例外(オフにする日・いつもの曜日以外の練習日)。変えられるのはトレーニング担当だけ。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current || !canAdminister(current)) {
    return NextResponse.json({ error: "練習日を変える権限がありません。" }, { status: 403 });
  }

  const payload = (await request.json()) as { date?: unknown; kind?: unknown };
  const kind = payload.kind === "off" || payload.kind === "extra" ? payload.kind : null;
  if (!isIsoDate(payload.date) || (payload.kind !== null && kind === null)) {
    return NextResponse.json({ error: "日付か種類が正しくありません。" }, { status: 400 });
  }

  await setPracticeDayOverride(teamSlug, payload.date, kind);
  return NextResponse.json({ ok: true });
}
