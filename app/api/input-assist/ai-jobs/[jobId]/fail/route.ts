import { NextResponse } from "next/server";
import { failAiJob } from "@/lib/server/input-assist-ai-jobs";
import { authorizeWorker } from "@/lib/server/input-assist-worker-auth";

type RouteContext = { params: Promise<{ jobId: string }> };

// 係が呼ぶ:失敗 {error}。解析中の依頼だけ。
export async function POST(request: Request, context: RouteContext) {
  const denied = authorizeWorker(request);
  if (denied) {
    return denied;
  }
  const { jobId } = await context.params;
  const payload = ((await request.json().catch(() => null)) ?? {}) as { error?: unknown };
  if (!(await failAiJob(jobId, payload.error))) {
    return NextResponse.json({ error: "解析中の依頼が見つかりません。" }, { status: 409 });
  }
  console.log("[api/input-assist/ai-jobs] failed", { jobId });
  return NextResponse.json({ ok: true });
}
