import { StaffSettingsClient } from "@/components/staff-settings-client";
import { formatTeamSlugLabel } from "@/lib/domain/team";
import {
  getScoutFileLibrary,
  getStaffAppSettings,
  getVideoLibrary,
} from "@/lib/server/app-settings-store";
import { listSavedWorkspaces } from "@/lib/server/workspace-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamStaffSettingsPage({ params }: PageProps) {
  const { teamSlug } = await params;
  const teamName = formatTeamSlugLabel(teamSlug);
  const appSettings = await getStaffAppSettings();
  const scoutLibrary = await getScoutFileLibrary(teamSlug);
  const videoLibrary = await getVideoLibrary(teamSlug);
  const workspaces = (await listSavedWorkspaces()).filter(
    (workspace) => workspace.teamSlug === teamSlug,
  );

  return (
    <main className="page-shell stack">
      <StaffSettingsClient
        initialSettings={appSettings}
        scoutLibrary={scoutLibrary}
        videoLibrary={videoLibrary}
        workspaces={workspaces}
        teamName={teamName}
        teamSlug={teamSlug}
      />
    </main>
  );
}
