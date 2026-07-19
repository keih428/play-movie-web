"use client";

import { useEffect, useRef, useState } from "react";
import { getSkillLabel } from "@/lib/domain/display";
import {
  calculateSeekSeconds,
  extractYouTubeVideoId,
  formatSeconds,
  getVideoSourceForSet,
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
        pauseVideo: () => void;
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
  activeSetIndex?: number;
  pauseToken?: number;
  onPlayerTimeChange: (seconds: number | undefined) => void;
};

const PLAYER_ELEMENT_ID = "youtube-player-slot";

export function VideoPlayer({
  match,
  settings,
  selectedPlay,
  activeSetIndex,
  pauseToken,
  onPlayerTimeChange,
}: VideoPlayerProps) {
  const playerRef = useRef<{
    destroy: () => void;
    cueVideoById: (videoId: string) => void;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
    playVideo: () => void;
    pauseVideo: () => void;
    getCurrentTime: () => number;
  } | null>(null);
  const pollingRef = useRef<number | null>(null);
  const [playerReadyToken, setPlayerReadyToken] = useState(0);
  const effectiveSetIndex =
    selectedPlay?.setIndex ?? activeSetIndex ?? match?.sets[0]?.setIndex;
  const activeVideoSource = getVideoSourceForSet(settings, effectiveSetIndex);
  const videoId = extractYouTubeVideoId(activeVideoSource.youtubeUrl);

  useEffect(() => {
    if (!videoId) {
      onPlayerTimeChange(undefined);
      setPlayerReadyToken(0);
      return;
    }

    let cancelled = false;
    setPlayerReadyToken(0);

    const createPlayer = () => {
      if (cancelled || !window.YT || playerRef.current) {
        return;
      }

      try {
        playerRef.current = new window.YT.Player(PLAYER_ELEMENT_ID, {
          videoId,
          playerVars: {
            rel: 0,
          },
          events: {
            onReady: () => {
              onPlayerTimeChange(0);
              setPlayerReadyToken((current) => current + 1);
            },
          },
        });

        pollingRef.current = window.setInterval(() => {
          if (!playerRef.current) {
            return;
          }

          try {
            onPlayerTimeChange(playerRef.current.getCurrentTime());
          } catch {
            onPlayerTimeChange(undefined);
          }
        }, 500);
      } catch {
        onPlayerTimeChange(undefined);
        playerRef.current = null;
      }
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

  const selectedSeek = selectedPlay
    ? calculateSeekSeconds(selectedPlay, settings, match)
    : undefined;

  useEffect(() => {
    if (!playerRef.current || !selectedPlay || typeof selectedSeek !== "number") {
      return;
    }

    try {
      playerRef.current.seekTo(selectedSeek, true);
      playerRef.current.playVideo();
    } catch {
      onPlayerTimeChange(undefined);
    }
  }, [onPlayerTimeChange, playerReadyToken, selectedPlay, selectedSeek, videoId]);

  useEffect(() => {
    if (!playerRef.current || typeof pauseToken !== "number") {
      return;
    }

    try {
      playerRef.current.pauseVideo();
    } catch {
      onPlayerTimeChange(undefined);
    }
  }, [onPlayerTimeChange, pauseToken]);

  return (
    <section className="panel">
      <div className="panel-inner video-stage">
        <div>
          <h2>動画プレーヤー</h2> {/* YouTube IFrame Player API に接続 */}
        </div>

        {videoId ? (
          <div className="video-embed-shell">
            <div id={PLAYER_ELEMENT_ID} className="video-embed" />
          </div>
        ) : (
          <div className="video-placeholder">
            <div>
              <strong>
                {activeVideoSource.youtubeUrl || "このセットの動画URLが設定されていません"}
              </strong>
              <p className="muted">
                プレイ選択時の再生位置 =
                <span className="mono">
                  {" "}
                  (play.time / 10 - sourceSetStart) + offset - preroll{" "}
                </span>
              </p>
            </div>
          </div>
        )}

        <div className="meta-grid video-meta-grid">
          <div className="meta-card video-meta-card">
            <span className="muted">試合</span>
            <strong>{match ? `${match.teams.home.name} vs ${match.teams.away.name}` : "-"}</strong>
          </div>
          <div className="meta-card video-meta-card">
            <span className="muted">セット数</span>
            <strong>{match?.sets.length ?? 0}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
