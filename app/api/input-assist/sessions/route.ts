import { NextRequest, NextResponse } from "next/server";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import {
  createInputAssistSession,
  listInputAssistSessions,
  validateSessionInput,
  type InputAssistSessionInput,
} from "@/lib/server/input-assist-store";

// 打ち込み補助の試合の一覧と、新しい試合(スタッフとシステム担当だけ)。
export async function GET(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  return NextResponse.json({ sessions: await listInputAssistSessions(teamSlug) });
}

export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const payload = (await request.json().catch(() => null)) as InputAssistSessionInput | null;
  const problem = validateSessionInput(payload ?? {}, false);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }
  try {
    const session = await createInputAssistSession(teamSlug, payload ?? {}, auth.member);
    return NextResponse.json({ session });
  } catch (error) {
    console.error("[api/input-assist] create failed", error);
    return NextResponse.json({ error: "保存できませんでした。" }, { status: 500 });
  }
}
