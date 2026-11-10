import { NextRequest, NextResponse } from "next/server";
import { isPassName } from "@/lib/domain/input-assist/collab";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import {
  ASSIGNMENT_ACTIONS,
  updateInputAssistAssignment,
  type AssignmentAction,
} from "@/lib/server/input-assist-store";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

// 担当の表:担当する(claim)・まだいる(heartbeat)・外す(release)・完了にする(done)・完了を取り消す(reopen)。
export async function POST(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  const payload = (await request.json().catch(() => null)) as
    | { action?: unknown; setIndex?: unknown; pass?: unknown; force?: unknown }
    | null;
  const setIndex = Number(payload?.setIndex);
  const action = payload?.action as AssignmentAction;
  const pass = payload?.pass;
  if (
    !ASSIGNMENT_ACTIONS.includes(action) ||
    !(Number.isInteger(setIndex) && setIndex >= 1 && setIndex <= 5) ||
    !isPassName(pass)
  ) {
    return NextResponse.json({ error: "中身が読めません。" }, { status: 400 });
  }
  try {
    const result = await updateInputAssistAssignment(
      teamSlug,
      sessionId,
      action,
      setIndex,
      pass,
      auth.member,
      payload?.force === true,
    );
    if (!result) {
      return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/input-assist] assignment failed", error);
    return NextResponse.json({ error: "担当を変えられませんでした。" }, { status: 500 });
  }
}
