import { NextResponse } from "next/server";
import { claimAiJob } from "@/lib/server/input-assist-ai-jobs";
import { authorizeWorker } from "@/lib/server/input-assist-worker-auth";

export const dynamic = "force-dynamic";

// 係(Mac・Wisteria)が呼ぶ:一番古い「待ち」の依頼を1つ受け取り、解析中にする。なければ 204。
// 部内ポータルのログインではなく、Authorization: Bearer <INPUT_ASSIST_WORKER_TOKEN> で確かめる。
export async function POST(request: Request) {
  const denied = authorizeWorker(request);
  if (denied) {
    return denied;
  }
  try {
    const job = await claimAiJob();
    if (!job) {
      return new Response(null, { status: 204 });
    }
    console.log("[api/input-assist/ai-jobs] claimed", { jobId: job.jobId, sessionId: job.sessionId });
    return NextResponse.json(job);
  } catch (error) {
    console.error("[api/input-assist/ai-jobs] claim failed", error);
    return NextResponse.json({ error: "依頼を受け取れませんでした。" }, { status: 500 });
  }
}
