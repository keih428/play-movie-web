import { NextRequest, NextResponse } from "next/server";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import { appendInputAssistPassLog, type PassLogInput } from "@/lib/server/input-assist-store";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

// パスにかかった時間を足す(1セットにかかる時間を測るため)。
export async function POST(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  const payload = (await request.json().catch(() => null)) as PassLogInput | null;
  const log = await appendInputAssistPassLog(teamSlug, sessionId, payload ?? {}, auth.member);
  if (!log) {
    return NextResponse.json({ error: "記録できませんでした。" }, { status: 400 });
  }
  return NextResponse.json({ log });
}
