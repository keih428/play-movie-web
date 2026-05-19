import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceStoreProvider,
  listSavedWorkspaces,
  saveWorkspace,
} from "@/lib/server/workspace-store";
import type { PersistedWorkspace } from "@/lib/domain/types";

export async function GET() {
  const workspaces = await listSavedWorkspaces();
  const provider = await getWorkspaceStoreProvider();
  return NextResponse.json({ provider, workspaces });
}

export async function POST(request: NextRequest) {
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
}
