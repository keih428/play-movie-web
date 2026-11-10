import { NextRequest, NextResponse } from "next/server";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import {
  getInputAssistSession,
  InputAssistConflictError,
  updateInputAssistSession,
  validateSessionInput,
  type InputAssistSessionInput,
} from "@/lib/server/input-assist-store";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  const session = await getInputAssistSession(teamSlug, sessionId);
  if (!session) {
    return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

// 保存。expectedUpdatedAt が今の保存と違えば、ほかの画面が先に保存したので 409 で今の中身を返す。
export async function PUT(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  const payload = (await request.json().catch(() => null)) as
    | (InputAssistSessionInput & { expectedUpdatedAt?: unknown })
    | null;
  if (!payload) {
    return NextResponse.json({ error: "中身が読めません。" }, { status: 400 });
  }
  const problem = validateSessionInput(payload, true);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }
  try {
    const session = await updateInputAssistSession(
      teamSlug,
      sessionId,
      payload,
      typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : undefined,
    );
    if (!session) {
      return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof InputAssistConflictError) {
      return NextResponse.json({ error: error.message, session: error.current }, { status: 409 });
    }
    console.error("[api/input-assist] update failed", error);
    return NextResponse.json({ error: "保存できませんでした。" }, { status: 500 });
  }
}
