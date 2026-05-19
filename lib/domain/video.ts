import type { ParsedPlay, VideoSyncSettings } from "@/lib/domain/types";

export function getBasePlayTime(
  play: ParsedPlay,
  useOriginalTime: boolean,
): number | undefined {
  if (useOriginalTime && typeof play.originalTime === "number") {
    return play.originalTime;
  }

  if (typeof play.time === "number") {
    return play.time;
  }

  return play.originalTime;
}

export function calculateSeekSeconds(
  play: ParsedPlay,
  settings: VideoSyncSettings,
): number | undefined {
  const baseTime = getBasePlayTime(play, settings.useOriginalTime);
  if (typeof baseTime !== "number") {
    return undefined;
  }

  return Math.max(0, baseTime + settings.offsetSeconds - settings.prerollSeconds);
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
