import { NextResponse } from "next/server";
import { getScoutFileRecord } from "@/lib/server/app-settings-store";

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const teamSlug = new URL(request.url).searchParams.get("team") ?? undefined;
  const record = await getScoutFileRecord(fileId, teamSlug);

  if (!record) {
    return NextResponse.json(
      { error: "試合データが見つかりません" },
      { status: 404 },
    );
  }

  return NextResponse.json({ record });
}
