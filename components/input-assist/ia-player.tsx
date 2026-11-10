"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { extractYouTubeVideoId } from "@/lib/domain/video";

// 打ち込み補助の動画。試合ビューアの video-player と同じ YouTube IFrame Player API を使い、
// ラリーの区間だけを流せるよう、外から「この秒から流す」「止める」「今の秒」を呼べるようにしたもの。
// window.YT の型は components/video-player.tsx で宣言している。

export type IaPlayerHandle = {
  playFrom: (seconds: number) => void;
  pause: () => void;
  getTime: () => number | undefined;
  /** 再生中なら止め、止まっていれば流す。 */
  togglePlay: () => void;
  /** 再生・停止はそのままで、この秒へ動かす。 */
  seek: (seconds: number) => void;
  /** 再生の速さ(1・0.75・0.5 など)。 */
  setRate: (rate: number) => void;
};

/** YouTube の再生中の状態(YT.PlayerState.PLAYING)。 */
const YT_PLAYING = 1;

type YouTubePlayer = NonNullable<Window["YT"]> extends { Player: new (...args: never[]) => infer P } ? P : never;

type IaPlayerProps = {
  youtubeUrl: string;
  onTime: (seconds: number) => void;
  ref?: Ref<IaPlayerHandle>;
};

let playerElementCount = 0;
const POLL_MS = 200;

export function IaPlayer({ youtubeUrl, onTime, ref }: IaPlayerProps) {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const onTimeRef = useRef(onTime);
  const rateRef = useRef(1);
  const [error, setError] = useState("");

  useEffect(() => {
    onTimeRef.current = onTime;
  }, [onTime]);

  useImperativeHandle(
    ref,
    () => ({
      playFrom(seconds: number) {
        const player = playerRef.current;
        if (!player || !readyRef.current) {
          pendingSeekRef.current = seconds;
          return;
        }
        try {
          player.seekTo(Math.max(0, seconds), true);
          player.playVideo();
        } catch {
          pendingSeekRef.current = seconds;
        }
      },
      pause() {
        try {
          playerRef.current?.pauseVideo();
        } catch {
          // 準備ができていなければ何もしない
        }
      },
      getTime() {
        try {
          return readyRef.current ? playerRef.current?.getCurrentTime() : undefined;
        } catch {
          return undefined;
        }
      },
      togglePlay() {
        const player = playerRef.current;
        if (!player || !readyRef.current) {
          return;
        }
        try {
          if (player.getPlayerState?.() === YT_PLAYING) {
            player.pauseVideo();
          } else {
            player.playVideo();
          }
        } catch {
          // 準備ができていなければ何もしない
        }
      },
      seek(seconds: number) {
        try {
          if (readyRef.current) {
            playerRef.current?.seekTo(Math.max(0, seconds), true);
          }
        } catch {
          // 準備ができていなければ何もしない
        }
      },
      setRate(rate: number) {
        rateRef.current = rate;
        try {
          if (readyRef.current) {
            playerRef.current?.setPlaybackRate?.(rate);
          }
        } catch {
          // 準備ができていなければ、準備ができたときに合わせる
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (!videoId) {
      return;
    }
    const host = hostRef.current;
    let cancelled = false;
    let polling: number | null = null;
    readyRef.current = false;
    setError("");

    const createPlayer = () => {
      if (cancelled || !window.YT?.Player || playerRef.current || !host) {
        return;
      }
      // YouTube の API は差し込み先の要素を iframe に置き換えるので、React が持たない要素を毎回作る。
      playerElementCount += 1;
      const target = document.createElement("div");
      target.id = `ia-youtube-player-${playerElementCount}`;
      host.replaceChildren(target);
      try {
        playerRef.current = new window.YT.Player(target.id, {
          videoId,
          playerVars: { rel: 0, playsinline: 1 },
          events: {
            onReady: () => {
              readyRef.current = true;
              if (rateRef.current !== 1) {
                playerRef.current?.setPlaybackRate?.(rateRef.current);
              }
              const pending = pendingSeekRef.current;
              pendingSeekRef.current = null;
              if (pending !== null) {
                playerRef.current?.seekTo(pending, true);
                playerRef.current?.playVideo();
              }
            },
          },
        });
        polling = window.setInterval(() => {
          if (!readyRef.current || !playerRef.current) {
            return;
          }
          try {
            onTimeRef.current(playerRef.current.getCurrentTime());
          } catch {
            // 読めないときは飛ばす
          }
        }, POLL_MS);
      } catch {
        setError("動画を開けませんでした。");
        playerRef.current = null;
      }
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      if (!document.getElementById("youtube-iframe-api")) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(script);
      }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      if (polling !== null) {
        window.clearInterval(polling);
      }
      readyRef.current = false;
      try {
        playerRef.current?.destroy();
      } catch {
        // 消せなくても、下で要素ごと外す
      }
      playerRef.current = null;
      host?.replaceChildren();
    };
  }, [videoId]);

  if (!videoId) {
    return (
      <div className="video-placeholder ia-video-placeholder">
        <strong>{youtubeUrl ? "YouTube の URL として読めません" : "このセットの動画の URL がありません(準備で入れてください)"}</strong>
      </div>
    );
  }

  return (
    <div>
      <div ref={hostRef} className="ia-player-host" />
      {error ? <p className="ia-error">{error}</p> : null}
    </div>
  );
}
