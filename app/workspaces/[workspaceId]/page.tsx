import { notFound } from "next/navigation";
import { getSavedWorkspace } from "@/lib/server/workspace-store";
import { WorkspaceClient } from "@/app/workspaces/[workspaceId]/workspace-client";

type PageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function WorkspaceViewerPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const workspace = await getSavedWorkspace(workspaceId);

  if (!workspace) {
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
      initialStatus={`Loaded workspace ${workspace.name}`}
      skipLocalRestore
    />
  );
}
