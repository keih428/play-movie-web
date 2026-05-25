import { HomeClient } from "@/app/home-client";
import { getStaffAppSettings } from "@/lib/server/app-settings-store";
import { getSavedWorkspace } from "@/lib/server/workspace-store";
import type {
  ParsedCollection,
  SavedWorkspaceRecord,
  VideoSyncSettings,
} from "@/lib/domain/types";

const demoSettings: VideoSyncSettings = {
  youtubeUrl: "https://www.youtube.com/watch?v=demo-video-id",
  offsetSeconds: 12,
  prerollSeconds: 4,
  useOriginalTime: false,
};

const emptyCollection: ParsedCollection = {
  sourceType: "vsm",
  matches: [],
};

type HomePageProps = {
  searchParams: Promise<{
    workspaceId?: string;
  }>;
};

async function getInitialWorkspace(
  workspaceId?: string,
): Promise<SavedWorkspaceRecord | null> {
  if (!workspaceId) {
    return null;
  }

  return getSavedWorkspace(workspaceId);
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { workspaceId } = await searchParams;
  const appSettings = await getStaffAppSettings();
  const resolvedWorkspaceId = workspaceId ?? appSettings.defaultWorkspaceId;
  const savedWorkspace = await getInitialWorkspace(resolvedWorkspaceId);
  const parsedCollection = savedWorkspace?.collection ?? emptyCollection;
  const initialSettings = savedWorkspace?.settings ?? demoSettings;
  const initialStatus = savedWorkspace
    ? workspaceId
      ? `Loaded workspace ${savedWorkspace.name} from URL`
      : `Loaded current match ${savedWorkspace.name}`
    : appSettings.landingMessage ?? "現在公開中の試合データはまだ設定されていません。";

  return (
    <HomeClient
      allowEditing={false}
      initialCollection={parsedCollection}
      initialSettings={initialSettings}
      initialWorkspaceId={savedWorkspace?.id}
      initialWorkspaceName={savedWorkspace?.name}
      initialRemoteSavedAt={savedWorkspace?.updatedAt}
      initialStatus={initialStatus}
      skipLocalRestore={Boolean(savedWorkspace)}
      landingMessage={appSettings.landingMessage}
    />
  );
}
