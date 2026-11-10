import { NextResponse } from "next/server";
import { reportAiJobProgress } from "@/lib/server/input-assist-ai-jobs";
import { authorizeWorker } from "@/lib/server/input-assist-worker-auth";

type RouteContext = { params: Promise<{ jobId: string }> };

// 係が呼ぶ:進み具合 {message, percent}。解析中の依頼だけ受け取る(30 分の期限も延ばす)。
export async function POST(request: Request, context: RouteContext) {
  const denied = authorizeWorker(request);
  if (denied) {
    return denied;
  }
  const { jobId } = await context.params;
  const payload = ((await request.json().catch(() => null)) ?? {}) as { message?: unknown; percent?: unknown };
  if (!(await reportAiJobProgress(jobId, payload))) {
    return NextResponse.json({ error: "解析中の依頼が見つかりません。" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
