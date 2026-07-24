import { NextResponse } from "next/server";
import { getScoutFileRecord } from "@/lib/server/app-settings-store";

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const url = new URL(request.url);
  const teamSlug = url.searchParams.get("team") ?? undefined;
  const shouldDownload = url.searchParams.get("download") === "1";
  const record = await getScoutFileRecord(fileId, teamSlug);

  if (!record) {
    return NextResponse.json(
      { error: "試合データが見つかりません" },
      { status: 404 },
    );
  }

  if (shouldDownload) {
    const content =
      typeof record.text === "string"
        ? record.text
        : Buffer.from(record.contentBase64 ?? "", "base64");
    const contentType =
      record.contentType ??
      (typeof record.text === "string"
        ? "text/plain; charset=utf-8"
        : "application/octet-stream");

    return new Response(content, {
      headers: {
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
        "Content-Type": contentType,
      },
    });
  }

  return NextResponse.json({ record });
}
