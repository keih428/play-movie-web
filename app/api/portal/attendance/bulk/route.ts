import { NextRequest, NextResponse } from "next/server";
import {
  ATTENDANCE_BULK_MAX,
  formatBulkAttendanceMessage,
  getLastAttendanceDate,
  parseAttendanceInput,
} from "@/lib/domain/attendance";
import { isIsoDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { saveReport } from "@/lib/server/portal-attendance-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { postToAttendanceChannel } from "@/lib/server/portal-slack";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

// 遅刻・早退・欠席の連絡を、何日分かまとめて出す(2026-11-06 から。授業で毎週火曜は 18:30 から、のような人のため)。
// どの日も同じ種類・時刻・理由。もう出してある日は訂正として上書きする。Slack のチャンネルには1通にまとめて流す。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    dates?: unknown;
    kind?: unknown;
    arriveAt?: unknown;
    leaveAt?: unknown;
    reason?: unknown;
    note?: unknown;
  } | null;
  const today = getTodayInJapan();
  const lastDate = getLastAttendanceDate(today);
  const dates = Array.isArray(payload?.dates) ? [...new Set(payload.dates)].sort() : [];
  if (dates.length === 0) {
    return NextResponse.json({ error: "日付を1つ以上選んでください。" }, { status: 400 });
  }
  if (dates.length > ATTENDANCE_BULK_MAX) {
    return NextResponse.json({ error: `一度に出せるのは${ATTENDANCE_BULK_MAX}日までです。` }, { status: 400 });
  }
  if (!dates.every((date): date is string => isIsoDate(date) && date >= today && date <= lastDate)) {
    return NextResponse.json(
      { error: "日付が正しくありません(過ぎた日と、3か月より先の日は出せません)。" },
      { status: 400 },
    );
  }
  const parsed = parseAttendanceInput(payload ?? {});
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let updatedCount = 0;
  for (const date of dates) {
    const { existed } = await saveReport({ teamSlug, memberId: current.id, practiceDate: date, ...parsed.input });
    if (existed) {
      updatedCount += 1;
    }
  }
  const slack = await postToAttendanceChannel(
    formatBulkAttendanceMessage(
      { memberName: current.displayName, position: current.position },
      dates,
      parsed.input,
      updatedCount,
    ),
  );
  return NextResponse.json({ count: dates.length, updatedCount, slack });
}
