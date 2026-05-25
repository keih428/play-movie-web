import { StaffSettingsClient } from "@/components/staff-settings-client";
import {
  getScoutFileLibrary,
  getStaffAppSettings,
  getVideoLibrary,
} from "@/lib/server/app-settings-store";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

export const metadata = {
  title: "スタッフ設定 | 東大バレー部 試合ビューア",
};

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const appSettings = await getStaffAppSettings();
  const scoutLibrary = await getScoutFileLibrary();
  const videoLibrary = await getVideoLibrary();
  const workspaces = await listSavedWorkspaces();

  return (
    <main className="page-shell stack">
      <StaffSettingsClient
        initialSettings={appSettings}
        scoutLibrary={scoutLibrary}
        videoLibrary={videoLibrary}
        workspaces={workspaces}
      />
    </main>
  );
}
