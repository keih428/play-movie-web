"use client";

import { useEffect, useRef } from "react";
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
  const activeSetIndex = selectedPlay?.setIndex ?? match?.sets[0]?.setIndex;
  const activeVideoSource = getVideoSourceForSet(settings, activeSetIndex);
  const videoId = extractYouTubeVideoId(activeVideoSource.youtubeUrl);

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
          <h2>動画プレーヤー</h2>
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
              <strong>
                {activeVideoSource.youtubeUrl || "このセットの動画URLが設定されていません"}
              </strong>
              <p className="muted">
                プレイ選択時の再生位置 =
                <span className="mono"> play.originalTime / 30 + offset - preroll </span>
              </p>
            </div>
          </div>
        )}

        <div className="meta-grid">
          <div className="meta-card">
            <span className="muted">試合</span>
            <strong>{match ? `${match.teams.home.name} vs ${match.teams.away.name}` : "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">セット数</span>
            <strong>{match?.sets.length ?? 0}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">再生対象セット</span>
            <strong>{activeSetIndex ?? "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">オフセット</span>
            <strong>{activeVideoSource.offsetSeconds}s</strong>
          </div>
          <div className="meta-card">
            <span className="muted">プリロール</span>
            <strong>{settings.prerollSeconds}s</strong>
          </div>
          <div className="meta-card">
            <span className="muted">時刻基準</span>
            <strong>originalTime / 30</strong>
          </div>
          <div className="meta-card">
            <span className="muted">セット動画</span>
            <strong>{activeVideoSource.youtubeUrl || "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">動画パス</span>
            <strong>{match?.video?.path ?? "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">選択中プレイ</span>
            <strong>{selectedPlay ? `${selectedPlay.skill ?? "-"} / ${selectedPlay.player ?? "-"}` : "-"}</strong>
          </div>
          <div className="meta-card">
            <span className="muted">移動先</span>
            <strong>{formatSeconds(selectedSeek)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
