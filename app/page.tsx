import { HomeClient } from "@/app/home-client";
import { getStaffAppSettings } from "@/lib/server/app-settings-store";
import type { ParsedCollection, VideoSyncSettings } from "@/lib/domain/types";

const demoSettings: VideoSyncSettings = {
  youtubeUrl: "https://www.youtube.com/watch?v=demo-video-id",
  offsetSeconds: 12,
  prerollSeconds: 3,
};

const emptyCollection: ParsedCollection = {
  sourceType: "vsm",
  matches: [],
};

export default async function HomePage() {
  const appSettings = await getStaffAppSettings();

  return (
    <HomeClient
      allowEditing={false}
      initialCollection={emptyCollection}
      initialSettings={demoSettings}
      initialStatus={
        appSettings.landingMessage ?? "現在公開中の試合データはまだ設定されていません。"
      }
      skipLocalRestore={false}
      landingMessage={appSettings.landingMessage}
    />
  );
}
