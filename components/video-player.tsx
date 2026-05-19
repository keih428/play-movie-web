"use client";

import { useEffect, useRef } from "react";
import {
  calculateSeekSeconds,
  extractYouTubeVideoId,
  formatSeconds,
} from "@/lib/domain/video";
import type { ParsedMatch, ParsedPlay, VideoSyncSettings } from "@/lib/domain/types";

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        config: {
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
          };
        },
      ) => {
        destroy: () => void;
        cueVideoById: (videoId: string) => void;
        seekTo: (seconds: number, allowSeekAhead: boolean) => void;
        playVideo: () => void;
        getCurrentTime: () => number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type VideoPlayerProps = {
  match?: ParsedMatch;
  settings: VideoSyncSettings;
  selectedPlay?: ParsedPlay;
  onPlayerTimeChange: (seconds: number | undefined) => void;
};

const PLAYER_ELEMENT_ID = "youtube-player-slot";

export function VideoPlayer({
  match,
  settings,
  selectedPlay,
  onPlayerTimeChange,
}: VideoPlayerProps) {
  const playerRef = useRef<{
    destroy: () => void;
    cueVideoById: (videoId: string) => void;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
    playVideo: () => void;
    getCurrentTime: () => number;
  } | null>(null);
  const pollingRef = useRef<number | null>(null);
  const videoId = extractYouTubeVideoId(settings.youtubeUrl);

  useEffect(() => {
    if (!videoId) {
      onPlayerTimeChange(undefined);
      return;
    }

    let cancelled = false;

    const createPlayer = () => {
      if (cancelled || !window.YT || playerRef.current) {
        return;
      }

      playerRef.current = new window.YT.Player(PLAYER_ELEMENT_ID, {
        videoId,
        playerVars: {
          rel: 0,
        },
        events: {
          onReady: () => {
            onPlayerTimeChange(0);
          },
        },
      });

      pollingRef.current = window.setInterval(() => {
        if (!playerRef.current) {
          return;
        }
        onPlayerTimeChange(playerRef.current.getCurrentTime());
      }, 500);
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const existingScript = document.getElementById("youtube-iframe-api");
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(script);
      }

      window.onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {
      cancelled = true;
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
      }
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [onPlayerTimeChange, videoId]);

  useEffect(() => {
    if (!playerRef.current || !videoId) {
      return;
    }

    playerRef.current.cueVideoById(videoId);
  }, [videoId]);

  useEffect(() => {
    if (!playerRef.current || !selectedPlay) {
      return;
    }

    const seekSeconds = calculateSeekSeconds(selectedPlay, settings);
    if (typeof seekSeconds !== "number") {
      return;
    }

    playerRef.current.seekTo(seekSeconds, true);
    playerRef.current.playVideo();
  }, [selectedPlay, settings]);

  const selectedSeek = selectedPlay
    ? calculateSeekSeconds(selectedPlay, settings)
    : undefined;

  return (
    <section className="panel">
      <div className="panel-inner video-stage">
        <div>
          <h2>Video Player Area</h2>
          <p className="muted">
            YouTube IFrame Player API に接続し、選択したプレイへシークできる状態です。
          </p>
        </div>

        {videoId ? (
          <div className="video-embed-shell">
            <div id={PLAYER_ELEMENT_ID} className="video-embed" />
          </div>
        ) : (
          <div className="video-placeholder">
            <div>
              <strong>{settings.youtubeUrl || "YouTube URL を設定してください"}</strong>
              <p className="muted">
                プレイ選択時の再生位置 =
                <span className="mono"> play.time + offset - preroll </span>
              </p>
            </div>
          </div>
        )}

        <div className="meta-grid">
          <div className="meta-card">
            <span className="muted">Match</span>
            <strong>{match ? `${match.teams.home.name} vs ${match.teams.away.name}` : "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">Sets</span>
            <strong>{match?.sets.length ?? 0}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">Offset</span>
            <strong>{settings.offsetSeconds}s</strong>
          </div>
          <div className="meta-card">
            <span className="muted">Preroll</span>
            <strong>{settings.prerollSeconds}s</strong>
          </div>
          <div className="meta-card">
            <span className="muted">Time Base</span>
            <strong>{settings.useOriginalTime ? "originalTime" : "time"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">Video Path</span>
            <strong>{match?.video?.path ?? "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">Selected Play</span>
            <strong>{selectedPlay ? `${selectedPlay.skill ?? "-"} / ${selectedPlay.player ?? "-"}` : "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">Seek Target</span>
            <strong>{formatSeconds(selectedSeek)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
