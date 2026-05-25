import { NextRequest, NextResponse } from "next/server";
import { getVideoLibrary, saveVideoLibrary } from "@/lib/server/app-settings-store";
import type { VideoLibraryNode } from "@/lib/domain/types";

export async function GET() {
  const library = await getVideoLibrary();
  return NextResponse.json({ library });
}

export async function PUT(request: NextRequest) {
  const payload = (await request.json()) as {
    root?: VideoLibraryNode[];
  };

  if (!Array.isArray(payload.root)) {
    return NextResponse.json({ error: "root is required" }, { status: 400 });
  }

  const library = await saveVideoLibrary({ root: payload.root });
  return NextResponse.json({ library });
}
