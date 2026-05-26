import type {
  ParsedMatch,
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
  match?: ParsedMatch,
): number | undefined {
  const baseTime = getBasePlayTimeSeconds(play);
  if (typeof baseTime !== "number") {
    return undefined;
  }

  const source = getVideoSourceForSet(settings, play.setIndex);
  if (!source.youtubeUrl) {
    return undefined;
  }
  const sourceBaseTime = getVideoSourceStartSeconds(source, match);
  return Math.max(
    0,
    baseTime -
      (typeof sourceBaseTime === "number" ? sourceBaseTime : 0) +
      source.offsetSeconds -
      settings.prerollSeconds,
  );
}

export function getVideoSourceForSet(
  settings: VideoSyncSettings,
  setIndex?: number,
): VideoSyncSetSource {
  const configuredSources = (settings.setVideos ?? [])
    .filter((entry) => entry.youtubeUrl)
    .sort((left, right) => left.setIndex - right.setIndex);

  if (typeof setIndex === "number") {
    const found = configuredSources
      .filter((entry) => entry.setIndex <= setIndex)
      .at(-1);
    if (found) {
      return found;
    }

    if (configuredSources.length > 0) {
      return {
        setIndex,
        youtubeUrl: "",
        offsetSeconds: 0,
      };
    }
  }

  return {
    setIndex: configuredSources[0]?.setIndex ?? 1,
    youtubeUrl: settings.youtubeUrl,
    offsetSeconds: settings.offsetSeconds,
  };
}

function getSetStartSeconds(
  match: ParsedMatch | undefined,
  setIndex: number,
): number | undefined {
  const set = match?.sets.find((entry) => entry.setIndex === setIndex);
  if (!set) {
    return undefined;
  }

  let earliestTime: number | undefined;
  for (const event of set.events) {
    for (const play of event.plays) {
      const baseTime = getBasePlayTimeSeconds(play);
      if (typeof baseTime !== "number") {
        continue;
      }

      if (typeof earliestTime !== "number" || baseTime < earliestTime) {
        earliestTime = baseTime;
      }
    }
  }

  return earliestTime;
}

function getVideoSourceStartSeconds(
  source: VideoSyncSetSource,
  match: ParsedMatch | undefined,
): number | undefined {
  return getSetStartSeconds(match, source.setIndex);
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
