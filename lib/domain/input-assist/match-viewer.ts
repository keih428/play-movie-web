// 「試合ビューアに保存」:打ち込み補助の試合を、試合ビューアのワークスペースの動画の設定にする。
//
// 試合ビューアは、プレーの位置を seek = play.time / 10 − (そのセットの最初のプレーの時刻) + offsetSeconds − preroll で決める
// (lib/domain/video.ts の calculateSeekSeconds。offsetMode "set" のとき、セットの最初のプレーの時刻は、そのセット自身のもの)。
// 打ち込み補助の VSM の time は「そのセットの動画の頭からの秒 × 10」なので、offsetSeconds を
// 「そのセットの最初のプレーの時刻」にすれば、seek = play.time / 10(− preroll)になる。
//
// VSM には打たないセットを書き出さないので、試合ビューアのセットの番号(1, 2, …)は、打つセットだけを数え直したもの。

import { getBasePlayTimeSeconds } from "@/lib/domain/video";
import type { ParsedMatch, VideoSyncSetSource, VideoSyncSettings } from "@/lib/domain/types";
import type { IaSet } from "@/lib/domain/input-assist/types";

/** 試合ビューアのセット(VSM の何番目のセットか)の、最初のプレーの時刻(秒)。プレーがなければ undefined。 */
export function firstPlaySeconds(match: ParsedMatch, vsmSetIndex: number): number | undefined {
  const set = match.sets.find((entry) => entry.setIndex === vsmSetIndex);
  let earliest: number | undefined;
  for (const event of set?.events ?? []) {
    for (const play of event.plays) {
      const time = getBasePlayTimeSeconds(play);
      if (typeof time === "number" && (earliest === undefined || time < earliest)) {
        earliest = time;
      }
    }
  }
  return earliest;
}

/**
 * 打ち込み補助のセット(打たないセットも含む)と、書き出した VSM を読んだ試合から、試合ビューアの動画の設定を作る。
 * セットごとに、そのセットの YouTube の URL と、seek = play.time / 10 になる offsetSeconds を入れる。
 */
export function buildMatchViewerSettings(
  sets: IaSet[],
  match: ParsedMatch,
  prerollSeconds = 0,
): VideoSyncSettings {
  const written = [...sets].filter((set) => !set.skipped).sort((left, right) => left.setIndex - right.setIndex);
  const setVideos: VideoSyncSetSource[] = written.map((set, index) => {
    const vsmSetIndex = index + 1;
    return {
      setIndex: vsmSetIndex,
      youtubeUrl: set.youtubeUrl.trim(),
      offsetSeconds: firstPlaySeconds(match, vsmSetIndex) ?? 0,
      offsetMode: "set",
    };
  });
  const first = setVideos.find((entry) => entry.youtubeUrl);
  return {
    youtubeUrl: first?.youtubeUrl ?? "",
    offsetSeconds: first?.offsetSeconds ?? 0,
    prerollSeconds,
    setVideos,
  };
}

/** 試合ビューアのワークスペースの名前(「2026-11-01 秋季リーグ 千葉大」)。 */
export function buildMatchViewerName(session: { title: string; date: string }): string {
  return `${session.date} ${session.title}`.trim();
}
