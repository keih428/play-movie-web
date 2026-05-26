import { notFound } from "next/navigation";
import { WorkspaceClient } from "@/app/workspaces/[workspaceId]/workspace-client";
import { getSavedWorkspace } from "@/lib/server/workspace-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
    workspaceId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TeamWorkspaceViewerPage({ params }: PageProps) {
  const { teamSlug, workspaceId } = await params;
  const workspace = await getSavedWorkspace(workspaceId);

  if (!workspace || workspace.teamSlug !== teamSlug) {
    notFound();
  }

  return (
    <WorkspaceClient
      allowEditing={false}
      initialCollection={workspace.collection}
      initialSettings={workspace.settings}
      initialSelectedMatchIndex={workspace.selectedMatchIndex}
      initialWorkspaceId={workspace.id}
      initialWorkspaceName={workspace.name}
      initialRemoteSavedAt={workspace.updatedAt}
      initialTeamName={workspace.teamName}
      initialTeamSlug={workspace.teamSlug}
      initialStatus={`Loaded workspace ${workspace.name}`}
      skipLocalRestore
    />
  );
}
