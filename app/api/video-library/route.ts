import { NextRequest, NextResponse } from "next/server";
import { getVideoLibrary, saveVideoLibrary } from "@/lib/server/app-settings-store";
import type { VideoLibraryNode } from "@/lib/domain/types";

export async function GET(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? undefined;
  const library = await getVideoLibrary(teamSlug ?? undefined);
  console.log("[api/video-library] GET", {
    teamSlug: teamSlug ?? null,
    rootCount: library.root.length,
    updatedAt: library.updatedAt,
  });
  return NextResponse.json({ library });
}

export async function PUT(request: NextRequest) {
  try {
    const teamSlug = request.nextUrl.searchParams.get("team") ?? undefined;
    const payload = (await request.json()) as {
      root?: VideoLibraryNode[];
    };

    if (!Array.isArray(payload.root)) {
      return NextResponse.json({ error: "root is required" }, { status: 400 });
    }

    const library = await saveVideoLibrary({ root: payload.root }, teamSlug);
    console.log("[api/video-library] PUT", {
      teamSlug: teamSlug ?? null,
      rootCount: library.root.length,
      updatedAt: library.updatedAt,
    });
    return NextResponse.json({ library });
  } catch (error) {
    console.error("video-library PUT failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ライブラリの保存に失敗しました",
      },
      { status: 500 },
    );
  }
}
