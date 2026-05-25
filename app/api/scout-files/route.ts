import { NextRequest, NextResponse } from "next/server";
import type { ParsedCollection, ScoutFileNode } from "@/lib/domain/types";
import { parseVsmText } from "@/lib/parsers/vsm";
import { parseVsdbText } from "@/lib/parsers/vsdb";
import {
  getScoutFileLibrary,
  saveScoutFileLibrary,
  saveScoutFileRecord,
} from "@/lib/server/app-settings-store";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function getFileExtension(fileName: string): ".vsm" | ".vsdb" | null {
  const lastDotIndex = fileName.lastIndexOf(".");
  const extension =
    lastDotIndex === -1 ? "" : fileName.slice(lastDotIndex).toLowerCase();

  if (extension === ".vsm" || extension === ".vsdb") {
    return extension;
  }

  return null;
}

function parseScoutFile(
  extension: ".vsm" | ".vsdb",
  text: string,
  fileName: string,
): ParsedCollection {
  if (extension === ".vsm") {
    return parseVsmText(text, fileName);
  }

  return parseVsdbText(text, fileName);
}

function addNode(
  nodes: ScoutFileNode[],
  parentId: string | null,
  node: ScoutFileNode,
): ScoutFileNode[] {
  if (!parentId) {
    return [...nodes, node];
  }

  return nodes.map((entry) => {
    if (entry.id === parentId && entry.type === "folder") {
      return {
        ...entry,
        children: [...(entry.children ?? []), node],
      };
    }

    if (entry.children) {
      return {
        ...entry,
        children: addNode(entry.children, parentId, node),
      };
    }

    return entry;
  });
}

export async function GET() {
  const library = await getScoutFileLibrary();
  console.log("[api/scout-files] GET", {
    rootCount: library.root.length,
    updatedAt: library.updatedAt,
  });
  return NextResponse.json({ library });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const parentIdValue = formData.get("parentId");
    const noteValue = formData.get("note");
    const displayNameValue = formData.get("displayName");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "ファイルを選択してください" },
        { status: 400 },
      );
    }

    const extension = getFileExtension(file.name || "");
    if (!extension) {
      return NextResponse.json(
        { error: "vsm または vsdb ファイルのみ登録できます" },
        { status: 400 },
      );
    }

    const parentId =
      typeof parentIdValue === "string" && parentIdValue.trim()
        ? parentIdValue
        : null;
    const text = await file.text();
    const parsedCollection = parseScoutFile(extension, text, file.name);
    const fileId = makeId();
    const uploadedAt = new Date().toISOString();
    console.log("[api/scout-files] POST start", {
      fileName: file.name,
      extension,
      size: text.length,
      fileId,
      parentId,
    });

    await saveScoutFileRecord({
      id: fileId,
      fileName: file.name,
      extension,
      text,
      parsedCollection,
      uploadedAt,
    });

    const library = await getScoutFileLibrary();
    const nextRoot = addNode(library.root, parentId, {
      id: makeId(),
      type: "file",
      name:
        typeof displayNameValue === "string" && displayNameValue.trim()
          ? displayNameValue.trim()
          : file.name.replace(/\.[^.]+$/, ""),
      fileId,
      extension,
      note:
        typeof noteValue === "string" && noteValue.trim()
          ? noteValue.trim()
          : undefined,
    });
    const savedLibrary = await saveScoutFileLibrary({ root: nextRoot });
    console.log("[api/scout-files] POST saved", {
      fileId,
      rootCount: savedLibrary.root.length,
      updatedAt: savedLibrary.updatedAt,
    });

    return NextResponse.json({ library: savedLibrary });
  } catch (error) {
    console.error("scout-files POST failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "試合データの登録に失敗しました",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      root?: ScoutFileNode[];
    };

    if (!Array.isArray(payload.root)) {
      return NextResponse.json(
        { error: "ルート構造が必要です" },
        { status: 400 },
      );
    }

    const library = await saveScoutFileLibrary({ root: payload.root });
    console.log("[api/scout-files] PUT", {
      rootCount: library.root.length,
      updatedAt: library.updatedAt,
    });
    return NextResponse.json({ library });
  } catch (error) {
    console.error("scout-files PUT failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "試合データライブラリの保存に失敗しました",
      },
      { status: 500 },
    );
  }
}
