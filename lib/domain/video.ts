import type {
  ParsedPlay,
  VideoSyncSetSource,
  VideoSyncSettings,
} from "@/lib/domain/types";

const VSM_FRAME_RATE = 30;

export function getBasePlayTimeSeconds(play: ParsedPlay): number | undefined {
  if (typeof play.originalTime === "number") {
    return play.originalTime / VSM_FRAME_RATE;
  }

  return undefined;
}

export function calculateSeekSeconds(
  play: ParsedPlay,
  settings: VideoSyncSettings,
): number | undefined {
  const baseTime = getBasePlayTimeSeconds(play);
  if (typeof baseTime !== "number") {
    return undefined;
  }

  const source = getVideoSourceForSet(settings, play.setIndex);
  return Math.max(
    0,
    baseTime + source.offsetSeconds - settings.prerollSeconds,
  );
}

export function getVideoSourceForSet(
  settings: VideoSyncSettings,
  setIndex?: number,
): VideoSyncSetSource {
  if (typeof setIndex === "number") {
    const found = settings.setVideos?.find((entry) => entry.setIndex === setIndex);
    if (found) {
      return found;
    }
  }

  return {
    setIndex: setIndex ?? 1,
    youtubeUrl: settings.youtubeUrl,
    offsetSeconds: settings.offsetSeconds,
  };
}

export function extractYouTubeVideoId(url: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname === "youtu.be") {
      return parsedUrl.pathname.replace("/", "") || undefined;
    }

    if (
      parsedUrl.hostname === "www.youtube.com" ||
      parsedUrl.hostname === "youtube.com" ||
      parsedUrl.hostname === "m.youtube.com"
    ) {
      if (parsedUrl.pathname === "/watch") {
        return parsedUrl.searchParams.get("v") || undefined;
      }

      if (parsedUrl.pathname.startsWith("/embed/")) {
        return parsedUrl.pathname.split("/")[2] || undefined;
      }

      if (parsedUrl.pathname.startsWith("/shorts/")) {
        return parsedUrl.pathname.split("/")[2] || undefined;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function formatSeconds(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }

  const safe = Math.max(0, Math.floor(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
