"use client";

import { useCallback, useEffect, useSyncExternalStore, type RefObject } from "react";
import type { IaPlayerHandle } from "@/components/input-assist/ia-player";

// 再生の速さ。どのパスでも同じ速さを使い、このブラウザに覚えておく(localStorage。使えなければ 1倍)。
// 1回に1つだけ見るパスでは、速めて流すと早く終わる(2026-11-10 から 1.25・1.5・2倍を足した)。

export const IA_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const STORAGE_KEY = "input-assist-playback-rate";

const listeners = new Set<() => void>();
let cachedRate: number | null = null;

function readRate(): number {
  if (cachedRate !== null) {
    return cachedRate;
  }
  let rate = 1;
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (IA_RATES.includes(stored)) {
      rate = stored;
    }
  } catch {
    // 使えなければ 1倍
  }
  cachedRate = rate;
  return rate;
}

function writeRate(rate: number) {
  cachedRate = rate;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(rate));
  } catch {
    // 覚えられなくても、この画面では使う
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 覚えている速さと、速さを変える関数。動画にも合わせる。 */
export function usePlaybackRate(playerRef: RefObject<IaPlayerHandle | null>) {
  const rate = useSyncExternalStore(subscribe, readRate, () => 1);
  useEffect(() => {
    playerRef.current?.setRate(rate);
  }, [playerRef, rate]);
  const changeRate = useCallback((next: number) => writeRate(next), []);
  return { rate, changeRate };
}
