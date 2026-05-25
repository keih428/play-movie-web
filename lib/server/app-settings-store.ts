import type {
  ScoutFileLibrary,
  ScoutFileNode,
  ScoutFileRecord,
  StaffAppSettings,
  VideoLibrary,
  VideoLibraryNode,
} from "@/lib/domain/types";
import { readDocument, writeDocument } from "@/lib/server/document-store";

const APP_SETTINGS_KEY = "staff-app-settings";
const VIDEO_LIBRARY_KEY = "video-library";
const SCOUT_FILE_LIBRARY_KEY = "scout-file-library";
const SCOUT_FILE_RECORD_KEY_PREFIX = "scout-file-record";
export const MATCH_VIDEOS_FOLDER_ID = "system-match-videos";

function getMatchVideosFolder(): VideoLibraryNode {
  return {
    id: MATCH_VIDEOS_FOLDER_ID,
    type: "folder",
    name: "試合動画",
    systemKey: "match-videos",
    children: [],
  };
}

function normalizeVideoLibraryRoot(root: VideoLibraryNode[]): VideoLibraryNode[] {
  const preserved = root.filter((node) => node.id !== MATCH_VIDEOS_FOLDER_ID);
  const existing = root.find((node) => node.id === MATCH_VIDEOS_FOLDER_ID);
  const fixedFolder = {
    ...getMatchVideosFolder(),
    ...existing,
    id: MATCH_VIDEOS_FOLDER_ID,
    type: "folder" as const,
    name: "試合動画",
    systemKey: "match-videos" as const,
    children: existing?.children ?? [],
  };

  return [fixedFolder, ...preserved];
}

function collectVideoLinks(
  nodes: VideoLibraryNode[],
  bucket: VideoLibraryNode[] = [],
): VideoLibraryNode[] {
  nodes.forEach((node) => {
    if (node.type === "link" && node.url) {
      bucket.push(node);
    }
    if (node.children?.length) {
      collectVideoLinks(node.children, bucket);
    }
  });

  return bucket;
}

export async function getStaffAppSettings(): Promise<StaffAppSettings> {
  return (
    (await readDocument<StaffAppSettings>(APP_SETTINGS_KEY)) ?? {
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function saveStaffAppSettings(
  input: Omit<StaffAppSettings, "updatedAt">,
): Promise<StaffAppSettings> {
  return writeDocument(APP_SETTINGS_KEY, {
    ...input,
    updatedAt: new Date().toISOString(),
  });
}

export async function getVideoLibrary(): Promise<VideoLibrary> {
  const library =
    (await readDocument<VideoLibrary>(VIDEO_LIBRARY_KEY)) ?? {
      root: [],
      updatedAt: new Date().toISOString(),
    };

  return {
    ...library,
    root: normalizeVideoLibraryRoot(library.root),
  };
}

export async function saveVideoLibrary(
  input: Pick<VideoLibrary, "root">,
): Promise<VideoLibrary> {
  return writeDocument(VIDEO_LIBRARY_KEY, {
    root: normalizeVideoLibraryRoot(input.root),
    updatedAt: new Date().toISOString(),
  });
}

export async function getLatestVideoLibraryLink(): Promise<VideoLibraryNode | null> {
  const library = await getVideoLibrary();
  const links = collectVideoLinks(library.root);
  if (links.length === 0) {
    return null;
  }

  return links.reduce<VideoLibraryNode>((latest, current) => {
    if (!latest.createdAt && current.createdAt) {
      return current;
    }
    if (!current.createdAt) {
      return latest;
    }
    if (!latest.createdAt) {
      return current;
    }
    return current.createdAt > latest.createdAt ? current : latest;
  }, links[links.length - 1]);
}

function normalizeScoutFileLibraryRoot(root: ScoutFileNode[]): ScoutFileNode[] {
  return root.map((node) => ({
    ...node,
    children:
      node.type === "folder"
        ? normalizeScoutFileLibraryRoot(node.children ?? [])
        : undefined,
  }));
}

function getScoutFileRecordKey(fileId: string) {
  return `${SCOUT_FILE_RECORD_KEY_PREFIX}-${fileId}`;
}

export async function getScoutFileLibrary(): Promise<ScoutFileLibrary> {
  const library =
    (await readDocument<ScoutFileLibrary>(SCOUT_FILE_LIBRARY_KEY)) ?? {
      root: [],
      updatedAt: new Date().toISOString(),
    };

  return {
    ...library,
    root: normalizeScoutFileLibraryRoot(library.root),
  };
}

export async function saveScoutFileLibrary(
  input: Pick<ScoutFileLibrary, "root">,
): Promise<ScoutFileLibrary> {
  return writeDocument(SCOUT_FILE_LIBRARY_KEY, {
    root: normalizeScoutFileLibraryRoot(input.root),
    updatedAt: new Date().toISOString(),
  });
}

export async function getScoutFileRecord(
  fileId: string,
): Promise<ScoutFileRecord | null> {
  return readDocument<ScoutFileRecord>(getScoutFileRecordKey(fileId));
}

export async function saveScoutFileRecord(
  record: ScoutFileRecord,
): Promise<ScoutFileRecord> {
  return writeDocument(getScoutFileRecordKey(record.id), record);
}
