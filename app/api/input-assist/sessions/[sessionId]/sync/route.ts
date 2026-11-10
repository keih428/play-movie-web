import { NextRequest, NextResponse } from "next/server";
import { parseSliceKey, sliceKey } from "@/lib/domain/input-assist/collab";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import { getInputAssistSyncState } from "@/lib/server/input-assist-store";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export const dynamic = "force-dynamic";

// 4 秒ごとに見る:スライスの版・担当・パスの時間。known(「1-P0:3,1-P1:5」)より新しいスライスは中身も返す。
// meta に手元のメタの時刻を渡すと、違えば今のメタも返す。
export async function GET(request: NextRequest, context: RouteContext) {
  const params = request.nextUrl.searchParams;
  const teamSlug = params.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  const known = new Map<string, number>();
  for (const part of (params.get("known") ?? "").split(",")) {
    const [key, version] = part.split(":");
    const parsed = key ? parseSliceKey(key) : null;
    if (parsed && Number.isInteger(Number(version))) {
      known.set(sliceKey(parsed.setIndex, parsed.pass), Number(version));
    }
  }
  try {
    const state = await getInputAssistSyncState(teamSlug, sessionId, known, params.get("meta"));
    if (!state) {
      return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/input-assist] sync failed", error);
    return NextResponse.json({ error: "読み込めませんでした。" }, { status: 500 });
  }
}
