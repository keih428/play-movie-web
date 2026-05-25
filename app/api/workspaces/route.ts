import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceStoreProvider,
  listSavedWorkspaces,
  saveWorkspace,
} from "@/lib/server/workspace-store";
import type { PersistedWorkspace } from "@/lib/domain/types";

export async function GET() {
  try {
    const workspaces = await listSavedWorkspaces();
    const provider = await getWorkspaceStoreProvider();
    return NextResponse.json({ provider, workspaces });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ワークスペース一覧の取得に失敗しました",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      id?: string;
      name?: string;
      workspace?: PersistedWorkspace;
    };

    if (!payload.workspace) {
      return NextResponse.json(
        { error: "workspace is required" },
        { status: 400 },
      );
    }

    const record = await saveWorkspace({
      id: payload.id,
      name: payload.name,
      workspace: payload.workspace,
    });

    const provider = await getWorkspaceStoreProvider();
    return NextResponse.json({ provider, workspace: record });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ワークスペースの保存に失敗しました",
      },
      { status: 500 },
    );
  }
}
