import { NextResponse } from "next/server";
import { completeAiJob } from "@/lib/server/input-assist-ai-jobs";
import { authorizeWorker } from "@/lib/server/input-assist-worker-auth";

type RouteContext = { params: Promise<{ jobId: string }> };

// 係が呼ぶ:できた骨組み {skeleton, meta}。skeleton は「骨組みを読み込む」の JSON と同じ形。
// ラリーが空のセットには、ここで自動で入れる。
export async function POST(request: Request, context: RouteContext) {
  const denied = authorizeWorker(request);
  if (denied) {
    return denied;
  }
  const { jobId } = await context.params;
  const payload = (await request.json().catch(() => null)) as { skeleton?: unknown; meta?: unknown } | null;
  if (!payload) {
    return NextResponse.json({ error: "中身が読めません。" }, { status: 400 });
  }
  try {
    const result = await completeAiJob(jobId, payload);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    console.log("[api/input-assist/ai-jobs] result", { jobId, ...result.applied });
    return NextResponse.json({ ok: true, ...result.applied });
  } catch (error) {
    console.error("[api/input-assist/ai-jobs] result failed", error);
    return NextResponse.json({ error: "骨組みを保存できませんでした。" }, { status: 500 });
  }
}
