import { NextRequest, NextResponse } from "next/server";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import { listPortalPlayers, listRosterFiles, readRosterFromLibrary } from "@/lib/server/input-assist-roster";

export const dynamic = "force-dynamic";

// 打ち込み補助の名簿。
// - 何も付けない:データライブラリの vsdb・vsm の一覧
// - fileId:そのファイルの名簿(試合・チーム)
// - source=portal:部内ポータルの名簿の選手(背番号・名前)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const teamSlug = params.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  try {
    if (params.get("source") === "portal") {
      return NextResponse.json({ players: await listPortalPlayers(teamSlug) });
    }
    const fileId = params.get("fileId");
    if (fileId) {
      const roster = await readRosterFromLibrary(teamSlug, fileId);
      if (!roster) {
        return NextResponse.json({ error: "データライブラリにそのファイルがありません。" }, { status: 404 });
      }
      return NextResponse.json({ roster });
    }
    return NextResponse.json({ files: await listRosterFiles(teamSlug) });
  } catch (error) {
    console.error("[api/input-assist] roster failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "名簿を読めませんでした。" },
      { status: 500 },
    );
  }
}
