import { NextRequest, NextResponse } from "next/server";
import type { ParsedCollection, ScoutFileNode } from "@/lib/domain/types";
import { parseVsmText } from "@/lib/parsers/vsm";
import { parseVsdbText } from "@/lib/parsers/vsdb";
import {
  getScoutFileLibrary,
  getLatestScoutFileRecord,
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

function findNode(nodes: ScoutFileNode[], targetId: string): ScoutFileNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }

    if (node.children) {
      const nested = findNode(node.children, targetId);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function hasNameConflict(
  nodes: ScoutFileNode[],
  parentId: string | null,
  name: string,
): boolean {
  const siblings = parentId
    ? findNode(nodes, parentId)?.type === "folder"
      ? findNode(nodes, parentId)?.children ?? []
      : []
    : nodes;

  return siblings.some((node) => normalizeName(node.name) === normalizeName(name));
}

export async function GET(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? undefined;
  const library = await getScoutFileLibrary(teamSlug);
  const latestRecord = await getLatestScoutFileRecord(teamSlug);
  console.log("[api/scout-files] GET", {
    teamSlug: teamSlug ?? null,
    rootCount: library.root.length,
    updatedAt: library.updatedAt,
  });
  return NextResponse.json({ library, latestUploadedAt: latestRecord?.uploadedAt });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const parentIdValue = formData.get("parentId");
    const noteValue = formData.get("note");
    const displayNameValue = formData.get("displayName");
    const teamSlugValue = formData.get("team");

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
    const teamSlug =
      typeof teamSlugValue === "string" && teamSlugValue.trim()
        ? teamSlugValue
        : undefined;
    const displayName =
      typeof displayNameValue === "string" && displayNameValue.trim()
        ? displayNameValue.trim()
        : file.name.replace(/\.[^.]+$/, "");
    const library = await getScoutFileLibrary(teamSlug);
    if (hasNameConflict(library.root, parentId, displayName)) {
      return NextResponse.json(
        { error: "同じフォルダ内に同名のフォルダまたは試合データは追加できません" },
        { status: 400 },
      );
    }

    const text = await file.text();
    const parsedCollection = parseScoutFile(extension, text, file.name);
    const fileId = makeId();
    const uploadedAt = new Date().toISOString();
    console.log("[api/scout-files] POST start", {
      fileName: file.name,
      extension,
      size: text.length,
      fileId,
      teamSlug: teamSlug ?? null,
      parentId,
    });

    await saveScoutFileRecord({
      id: fileId,
      fileName: file.name,
      extension,
      text,
      parsedCollection,
      uploadedAt,
    }, teamSlug);

    const nextRoot = addNode(library.root, parentId, {
      id: makeId(),
      type: "file",
      name: displayName,
      fileId,
      extension,
      note:
        typeof noteValue === "string" && noteValue.trim()
          ? noteValue.trim()
          : undefined,
    });
    const savedLibrary = await saveScoutFileLibrary({ root: nextRoot }, teamSlug);
    console.log("[api/scout-files] POST saved", {
      fileId,
      teamSlug: teamSlug ?? null,
      rootCount: savedLibrary.root.length,
      updatedAt: savedLibrary.updatedAt,
    });

    return NextResponse.json({ library: savedLibrary, latestUploadedAt: uploadedAt });
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
    const teamSlug = request.nextUrl.searchParams.get("team") ?? undefined;
    const payload = (await request.json()) as {
      root?: ScoutFileNode[];
    };

    if (!Array.isArray(payload.root)) {
      return NextResponse.json(
        { error: "ルート構造が必要です" },
        { status: 400 },
      );
    }

    const library = await saveScoutFileLibrary({ root: payload.root }, teamSlug);
    console.log("[api/scout-files] PUT", {
      teamSlug: teamSlug ?? null,
      rootCount: library.root.length,
      updatedAt: library.updatedAt,
    });
    const latestRecord = await getLatestScoutFileRecord(teamSlug);
    return NextResponse.json({ library, latestUploadedAt: latestRecord?.uploadedAt });
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
