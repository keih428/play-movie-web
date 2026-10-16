import { NextRequest, NextResponse } from "next/server";
import {
  ATTENDANCE_REASON_MAX,
  formatAttendanceMessage,
  getLastAttendanceDate,
  isAttendanceKind,
  isClockTime,
  needsArriveTime,
  needsLeaveTime,
} from "@/lib/domain/attendance";
import { isIsoDate } from "@/lib/domain/notes";
import { canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { deleteReport, saveReport } from "@/lib/server/portal-attendance-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { postToAttendanceChannel } from "@/lib/server/portal-slack";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

async function getContext(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  return current ? { teamSlug, current } : null;
}

// 遅刻・早退・欠席の連絡を出す(同じ日にもう出してあれば、訂正として上書きする)。
// 出すと、Slack の遅刻・欠席のチャンネルにも流れる。
export async function POST(request: NextRequest) {
  const context = await getContext(request);
  if (!context) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  const { teamSlug, current } = context;

  const payload = (await request.json()) as {
    date?: unknown;
    kind?: unknown;
    arriveAt?: unknown;
    leaveAt?: unknown;
    reason?: unknown;
    test?: unknown;
  };

  // システム担当が、チャンネルに流れるかを試すとき。
  if (payload.test === true) {
    if (!canManageSite(current)) {
      return NextResponse.json({ error: "テストできるのはシステム担当だけです。" }, { status: 403 });
    }
    return NextResponse.json({
      slack: await postToAttendanceChannel("部内ページからのテストです。遅刻・欠席の連絡は、ここに流れます。"),
    });
  }

  const today = getTodayInJapan();
  if (!isIsoDate(payload.date) || payload.date < today) {
    return NextResponse.json({ error: "日付が正しくありません(過ぎた日の連絡は出せません)。" }, { status: 400 });
  }
  if (payload.date > getLastAttendanceDate(today)) {
    return NextResponse.json({ error: "連絡を出せるのは、2か月先の日までです。" }, { status: 400 });
  }
  if (!isAttendanceKind(payload.kind)) {
    return NextResponse.json({ error: "欠席・遅刻・早退のどれかを選んでください。" }, { status: 400 });
  }
  const arriveAt = needsArriveTime(payload.kind) ? payload.arriveAt : null;
  const leaveAt = needsLeaveTime(payload.kind) ? payload.leaveAt : null;
  if (arriveAt !== null && !isClockTime(arriveAt)) {
    return NextResponse.json({ error: "遅刻のときは、何時から来られるかを入れてください。" }, { status: 400 });
  }
  if (leaveAt !== null && !isClockTime(leaveAt)) {
    return NextResponse.json({ error: "早退のときは、何時までいられるかを入れてください。" }, { status: 400 });
  }
  if (arriveAt && leaveAt && arriveAt >= leaveAt) {
    return NextResponse.json({ error: "来る時刻が、帰る時刻より後になっています。" }, { status: 400 });
  }
  const reason =
    typeof payload.reason === "string" ? payload.reason.trim().slice(0, ATTENDANCE_REASON_MAX) : "";
  if (!reason) {
    return NextResponse.json({ error: "理由を書いてください。" }, { status: 400 });
  }

  const { report, existed } = await saveReport({
    teamSlug,
    memberId: current.id,
    practiceDate: payload.date,
    kind: payload.kind,
    arriveAt: arriveAt as string | null,
    leaveAt: leaveAt as string | null,
    reason,
  });
  const slack = await postToAttendanceChannel(
    formatAttendanceMessage(report, existed ? "updated" : "new"),
  );
  return NextResponse.json({ report, slack });
}

// 自分の連絡を取り消す。取り消したことも、チャンネルに流す。
export async function DELETE(request: NextRequest) {
  const context = await getContext(request);
  if (!context) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date");
  if (!isIsoDate(date) || date < getTodayInJapan()) {
    return NextResponse.json({ error: "日付が正しくありません。" }, { status: 400 });
  }
  const report = await deleteReport(context.current.id, date);
  if (!report) {
    return NextResponse.json({ error: "その日の連絡は見つかりません。" }, { status: 404 });
  }
  const slack = await postToAttendanceChannel(formatAttendanceMessage(report, "canceled"));
  return NextResponse.json({ ok: true, slack });
}
