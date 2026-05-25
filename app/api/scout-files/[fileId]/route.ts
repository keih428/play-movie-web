import { NextResponse } from "next/server";
import { getScoutFileRecord } from "@/lib/server/app-settings-store";

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const record = await getScoutFileRecord(fileId);

  if (!record) {
    return NextResponse.json(
      { error: "試合データが見つかりません" },
      { status: 404 },
    );
  }

  return NextResponse.json({ record });
}
