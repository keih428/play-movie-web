import { NextRequest, NextResponse } from "next/server";
import { buildWorkspacePath } from "@/lib/domain/team";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import { MatchViewerError, saveInputAssistToMatchViewer } from "@/lib/server/input-assist-match-viewer";

type RouteContext = { params: Promise<{ sessionId: string }> };

// 「試合ビューアに保存」:VSM をデータライブラリに入れ、試合ビューアのワークスペースを作る(2回目からは新しくする)。
export async function POST(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  try {
    const result = await saveInputAssistToMatchViewer(teamSlug, sessionId);
    if (!result) {
      return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({
      ...result,
      viewerPath: buildWorkspacePath({ teamSlug, workspaceId: result.workspaceId }),
    });
  } catch (error) {
    if (error instanceof MatchViewerError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/input-assist] match-viewer failed", error);
    return NextResponse.json({ error: "試合ビューアに保存できませんでした。" }, { status: 500 });
  }
}
