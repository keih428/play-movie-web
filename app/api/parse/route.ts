import { NextRequest, NextResponse } from "next/server";
import { parseVsmText } from "@/lib/parsers/vsm";
import { parseVsdbText } from "@/lib/parsers/vsdb";

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex === -1 ? "" : fileName.slice(lastDotIndex).toLowerCase();
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file が必要です" },
      { status: 400 },
    );
  }

  const fileName = file.name || "unknown";
  const extension = getFileExtension(fileName);
  const text = await file.text();

  try {
    if (extension === ".vsm") {
      return NextResponse.json(parseVsmText(text, fileName));
    }

    if (extension === ".vsdb") {
      return NextResponse.json(parseVsdbText(text, fileName));
    }

    return NextResponse.json(
      { error: "未対応のファイル形式です" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "ファイル解析に失敗しました",
        detail: error instanceof Error ? error.message : "不明なエラーです",
      },
      { status: 400 },
    );
  }
}
