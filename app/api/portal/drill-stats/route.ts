import { NextRequest, NextResponse } from "next/server";
import { DRILL_NAME_MAX, canRecordDrillStats, normalizeDrillName } from "@/lib/domain/drill-stats";
import { isIsoDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { createDrill } from "@/lib/server/portal-drill-stat-store";
import { getCurrentMember } from "@/lib/server/portal-session";

// 集計するメニューを作る(マネージャーなど、集計を付けられる人だけ。2026-10-31 から)。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
  }
  if (!canRecordDrillStats(current)) {
    return NextResponse.json({ error: "集計を付けられるのは、マネージャー・アナリストなどだけです。" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { date?: unknown; name?: unknown } | null;
  if (!isIsoDate(payload?.date)) {
    return NextResponse.json({ error: "日付を選んでください。" }, { status: 400 });
  }
  const name = normalizeDrillName(payload?.name);
  if (!name) {
    return NextResponse.json({ error: `メニューの名前を1〜${DRILL_NAME_MAX}文字で入れてください。` }, { status: 400 });
  }

  const drill = await createDrill({ teamSlug, practiceDate: payload.date, name, createdBy: current.id });
  return NextResponse.json({ drill });
}
