import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceStoreProvider,
  listSavedWorkspaces,
  saveWorkspace,
} from "@/lib/server/workspace-store";
import { formatMatchAddedMessage } from "@/lib/domain/match-notice";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildWorkspacePath } from "@/lib/domain/team";
import type { PersistedWorkspace } from "@/lib/domain/types";
import { getBaseUrl, postToMatchChannel } from "@/lib/server/portal-slack";

export async function GET() {
  try {
    const workspaces = await listSavedWorkspaces();
    const provider = await getWorkspaceStoreProvider();
    console.log("[api/workspaces] GET", {
      provider,
      count: workspaces.length,
      ids: workspaces.map((workspace) => workspace.id),
    });
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
    console.log("[api/workspaces] POST", {
      provider,
      id: record.id,
      name: record.name,
      matchCount: record.collection.matches.length,
    });

    // 新しく登録した部の試合(動画つき)は、Slack の試合のチャンネルに流す(2026-11-12 から)。
    // id があるのは保存し直し。流せなくても登録は止めない。
    const hasVideo = [record.settings.youtubeUrl, ...(record.settings.setVideos ?? []).map((entry) => entry.youtubeUrl)].some(
      (url) => url?.trim(),
    );
    if (!payload.id && isPortalTeam(record.teamSlug) && hasVideo) {
      const url = `${getBaseUrl(request)}${buildWorkspacePath({ teamSlug: record.teamSlug, workspaceId: record.id })}`;
      const slack = await postToMatchChannel(
        formatMatchAddedMessage({
          name: record.name,
          match: record.collection.matches[record.selectedMatchIndex] ?? record.collection.matches[0],
          url,
        }),
      );
      if (!slack.ok) {
        console.log("[api/workspaces] match channel", slack.detail);
      }
    }
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
