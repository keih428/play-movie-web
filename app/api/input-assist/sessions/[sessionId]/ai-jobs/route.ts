import { NextRequest, NextResponse } from "next/server";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import { createAiJob, listAiJobs } from "@/lib/server/input-assist-ai-jobs";

type RouteContext = { params: Promise<{ sessionId: string }> };

export const dynamic = "force-dynamic";

// 「AI に骨組みを頼む」:この試合の依頼の一覧(新しい順)と、新しい依頼(今の準備から)。
export async function GET(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  try {
    return NextResponse.json({ jobs: await listAiJobs(teamSlug, sessionId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/input-assist] ai-jobs list failed", error);
    return NextResponse.json({ error: "読み込めませんでした。" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  try {
    const result = await createAiJob(teamSlug, sessionId, auth.member);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ job: result.job });
  } catch (error) {
    console.error("[api/input-assist] ai-jobs create failed", error);
    return NextResponse.json({ error: "頼めませんでした。" }, { status: 500 });
  }
}
