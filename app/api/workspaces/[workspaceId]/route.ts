import { NextResponse } from "next/server";
import {
  deleteSavedWorkspace,
  getSavedWorkspace,
  getWorkspaceStoreProvider,
} from "@/lib/server/workspace-store";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { workspaceId } = await context.params;
    const workspace = await getSavedWorkspace(workspaceId);

    if (!workspace) {
      return NextResponse.json({ error: "workspace not found" }, { status: 404 });
    }

    const provider = await getWorkspaceStoreProvider();
    return NextResponse.json({ provider, workspace });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ワークスペースの取得に失敗しました",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { workspaceId } = await context.params;
    const deleted = await deleteSavedWorkspace(workspaceId);

    if (!deleted) {
      return NextResponse.json({ error: "workspace not found" }, { status: 404 });
    }

    const provider = await getWorkspaceStoreProvider();
    return NextResponse.json({ ok: true, provider });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ワークスペースの削除に失敗しました",
      },
      { status: 500 },
    );
  }
}
