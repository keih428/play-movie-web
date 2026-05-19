import { readFile } from "node:fs/promises";
import path from "node:path";
import { HomeClient } from "@/app/home-client";
import { getSavedWorkspace } from "@/lib/server/workspace-store";
import { parseVsmText } from "@/lib/parsers/vsm";
import type { SavedWorkspaceRecord, VideoSyncSettings } from "@/lib/domain/types";

const demoSettings: VideoSyncSettings = {
  youtubeUrl: "https://www.youtube.com/watch?v=demo-video-id",
  offsetSeconds: 12,
  prerollSeconds: 4,
  useOriginalTime: false,
};

async function getDemoMatch() {
  const fileName = "2026-04-12 UTVB-TU.vsm";
  const samplePath = path.resolve(process.cwd(), "..", "vsm-vsdb-data", fileName);
  const sampleText = await readFile(samplePath, "utf8");
  const parsedCollection = parseVsmText(sampleText, fileName);
  return parsedCollection;
}

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
  const savedWorkspace = await getInitialWorkspace(workspaceId);
  const parsedCollection = savedWorkspace?.collection ?? (await getDemoMatch());
  const initialSettings = savedWorkspace?.settings ?? demoSettings;

  return (
    <HomeClient
      initialCollection={parsedCollection}
      initialSettings={initialSettings}
      initialWorkspaceId={savedWorkspace?.id}
      initialWorkspaceName={savedWorkspace?.name}
      initialRemoteSavedAt={savedWorkspace?.updatedAt}
      initialStatus={
        savedWorkspace
          ? `Loaded workspace ${savedWorkspace.name} from URL`
          : "Sample data loaded"
      }
      skipLocalRestore={Boolean(savedWorkspace)}
    />
  );
}
