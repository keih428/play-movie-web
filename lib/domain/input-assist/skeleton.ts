// AI が作った骨組み(ラリーの時刻・サーブの向き・確かさ)を読み込む。

import { createObjectId } from "@/lib/domain/input-assist/ids";
import { createEmptySet, roundTime } from "@/lib/domain/input-assist/session";
import type { IaRally, IaSet, IaSkeleton } from "@/lib/domain/input-assist/types";

export class SkeletonError extends Error {}

export function parseSkeleton(text: string): IaSkeleton {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SkeletonError("JSON として読めませんでした。");
  }
  if (!raw || typeof raw !== "object") {
    throw new SkeletonError("骨組みの形ではありません。");
  }
  const input = raw as Record<string, unknown>;
  if (input.version !== 1) {
    throw new SkeletonError("version が 1 の骨組みだけ読み込めます。");
  }
  if (!Array.isArray(input.rallies)) {
    throw new SkeletonError("rallies がありません。");
  }

  const rallies: IaSkeleton["rallies"] = [];
  input.rallies.forEach((entry, index) => {
    const rally = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const set = Math.trunc(Number(rally.set));
    const serveTime = Number(rally.serveTime);
    if (!(set >= 1 && set <= 5) || !Number.isFinite(serveTime) || serveTime < 0) {
      throw new SkeletonError(`${index + 1}番目のラリーの set か serveTime が読めません。`);
    }
    const pSide = Number(rally.pSide);
    rallies.push({
      set,
      serveTime,
      side: rally.side === "near" || rally.side === "far" ? rally.side : null,
      pSide: Number.isFinite(pSide) ? pSide : undefined,
      source: rally.source === "manual" ? "manual" : "auto",
    });
  });

  const youtube: Record<string, string> = {};
  if (input.youtube && typeof input.youtube === "object") {
    for (const [key, value] of Object.entries(input.youtube as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        youtube[String(Math.trunc(Number(key)))] = value.trim();
      }
    }
  }

  return { version: 1, youtube, rallies };
}

export type SkeletonApplyResult = {
  sets: IaSet[];
  /** 骨組みでラリーを入れ替えたセット。 */
  replacedSets: number[];
  rallyCount: number;
};

/**
 * 骨組みを今のセットに入れる。骨組みにあるセットは、ラリーを入れ替える(交代・スタメン・スコアは残す)。
 * ないセットは作る(スタメンは前のセットから写す)。YouTube の URL は骨組みにあれば入れる。
 */
export function applySkeleton(sets: IaSet[], skeleton: IaSkeleton): SkeletonApplyResult {
  const bySet = new Map<number, IaRally[]>();
  for (const rally of skeleton.rallies) {
    const list = bySet.get(rally.set) ?? [];
    list.push({
      id: createObjectId(),
      serveTime: roundTime(rally.serveTime),
      side: rally.side ?? null,
      confidence: rally.pSide,
      status: "rally",
      source: rally.source ?? "auto",
    });
    bySet.set(rally.set, list);
  }

  const setIndexes = new Set<number>([
    ...sets.map((set) => set.setIndex),
    ...bySet.keys(),
    ...Object.keys(skeleton.youtube ?? {}).map(Number).filter((value) => value >= 1 && value <= 5),
  ]);
  const ordered = [...setIndexes].sort((left, right) => left - right);
  const next: IaSet[] = [];
  for (const setIndex of ordered) {
    const existing = sets.find((set) => set.setIndex === setIndex);
    const base = existing ?? createEmptySet(setIndex, next.at(-1));
    const rallies = bySet.get(setIndex);
    const youtubeUrl = skeleton.youtube?.[String(setIndex)];
    next.push({
      ...base,
      youtubeUrl: youtubeUrl ?? base.youtubeUrl,
      rallies: rallies ? rallies.sort((left, right) => left.serveTime - right.serveTime) : base.rallies,
    });
  }

  return {
    sets: next,
    replacedSets: [...bySet.keys()].sort((left, right) => left - right),
    rallyCount: skeleton.rallies.length,
  };
}
