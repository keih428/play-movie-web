import { HomeClient } from "@/app/home-client";
import { StaffSettingsClient } from "@/components/staff-settings-client";
import { getStaffAppSettings } from "@/lib/server/app-settings-store";
import type {
  ParsedCollection,
  SavedWorkspaceRecord,
  VideoSyncSettings,
} from "@/lib/domain/types";
import { listSavedWorkspaces, getSavedWorkspace } from "@/lib/server/workspace-store";

export const metadata = {
  title: "Staff Settings | Play Movie Web",
};

const emptyCollection: ParsedCollection = {
  sourceType: "vsm",
  matches: [],
};

const defaultSettings: VideoSyncSettings = {
  youtubeUrl: "",
  offsetSeconds: 0,
  prerollSeconds: 0,
  useOriginalTime: false,
};

type StaffSettingsPageProps = {
  searchParams: Promise<{
    workspaceId?: string;
  }>;
};

async function resolveWorkspace(
  workspaceId?: string,
  fallbackId?: string,
): Promise<SavedWorkspaceRecord | null> {
  const resolved = workspaceId ?? fallbackId;
  if (!resolved) {
    return null;
  }

  return getSavedWorkspace(resolved);
}

export default async function StaffSettingsPage({
  searchParams,
}: StaffSettingsPageProps) {
  const { workspaceId } = await searchParams;
  const appSettings = await getStaffAppSettings();
  const workspaces = await listSavedWorkspaces();
  const workspace = await resolveWorkspace(
    workspaceId,
    appSettings.defaultWorkspaceId,
  );

  return (
    <div className="page-shell stack">
      <StaffSettingsClient
        initialSettings={appSettings}
        workspaces={workspaces}
      />
      <HomeClient
        allowEditing
        initialCollection={workspace?.collection ?? emptyCollection}
        initialSettings={workspace?.settings ?? defaultSettings}
        initialWorkspaceId={workspace?.id}
        initialWorkspaceName={workspace?.name}
        initialRemoteSavedAt={workspace?.updatedAt}
        initialStatus="スタッフ編集モード"
        skipLocalRestore
        landingMessage={appSettings.landingMessage}
      />
    </div>
  );
}
