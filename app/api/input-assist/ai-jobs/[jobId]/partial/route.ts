import { NextResponse } from "next/server";
import { reportAiJobPartial } from "@/lib/server/input-assist-ai-jobs";
import { authorizeWorker } from "@/lib/server/input-assist-worker-auth";

type RouteContext = { params: Promise<{ jobId: string }> };

// 係が呼ぶ:セットごとの途中の結果 {skeleton}。skeleton は result と同じ形で、解析し終えたセット(1つ以上)のラリーだけ。
// 解析中の依頼だけ受け取る(30 分の期限も延ばす)。届いたセットは、ここで result と同じ決まりで自動で入れる。
// 同じセットがまた届いたら、あとのほうで入れ替える。同じ中身をもう一度送っても二重には入らない。
export async function POST(request: Request, context: RouteContext) {
  const denied = authorizeWorker(request);
  if (denied) {
    return denied;
  }
  const { jobId } = await context.params;
  const payload = (await request.json().catch(() => null)) as { skeleton?: unknown } | null;
  if (!payload) {
    return NextResponse.json({ error: "中身が読めません。" }, { status: 400 });
  }
  try {
    const result = await reportAiJobPartial(jobId, payload);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    console.log("[api/input-assist/ai-jobs] partial", { jobId, sets: result.sets, ...result.applied });
    return NextResponse.json({ ok: true, sets: result.sets, ...result.applied });
  } catch (error) {
    console.error("[api/input-assist/ai-jobs] partial failed", error);
    return NextResponse.json({ error: "途中の結果を保存できませんでした。" }, { status: 500 });
  }
}
