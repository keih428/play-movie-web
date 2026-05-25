import type { StaffAppSettings, VideoLibrary } from "@/lib/domain/types";
import { readDocument, writeDocument } from "@/lib/server/document-store";

const APP_SETTINGS_KEY = "staff-app-settings";
const VIDEO_LIBRARY_KEY = "video-library";

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
  return (
    (await readDocument<VideoLibrary>(VIDEO_LIBRARY_KEY)) ?? {
      root: [],
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function saveVideoLibrary(
  input: Pick<VideoLibrary, "root">,
): Promise<VideoLibrary> {
  return writeDocument(VIDEO_LIBRARY_KEY, {
    root: input.root,
    updatedAt: new Date().toISOString(),
  });
}
