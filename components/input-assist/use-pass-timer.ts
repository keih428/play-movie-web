"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IaPassName } from "@/lib/domain/input-assist/types";

// パスにかかった時間を数える。パスのタブを開いていて、画面が見えていて、
// 2分以内に何か操作した(キー・クリック・動画が進んだ)ときだけ数える。
// 1分ごと・セットやタブを替えたとき・画面を離れたときに、サーバーへ足す。

const IDLE_LIMIT_MS = 2 * 60 * 1000;
const FLUSH_EVERY_SECONDS = 60;
const MIN_FLUSH_SECONDS = 3;

export type PassTimerFlush = {
  setIndex: number;
  pass: IaPassName;
  seconds: number;
  startedAt: string;
  endedAt: string;
};

export function usePassTimer({
  active,
  setIndex,
  pass,
  onFlush,
}: {
  active: boolean;
  setIndex: number;
  pass: IaPassName;
  onFlush: (entry: PassTimerFlush) => void;
}) {
  const secondsRef = useRef(0);
  const startedAtRef = useRef<string | null>(null);
  const lastActivityRef = useRef(Date.now());
  const onFlushRef = useRef(onFlush);
  const [pendingSeconds, setPendingSeconds] = useState(0);

  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const flush = useCallback(() => {
    const seconds = secondsRef.current;
    const startedAt = startedAtRef.current;
    secondsRef.current = 0;
    startedAtRef.current = null;
    setPendingSeconds(0);
    if (seconds >= MIN_FLUSH_SECONDS && startedAt) {
      onFlushRef.current({ setIndex, pass, seconds, startedAt, endedAt: new Date().toISOString() });
    }
  }, [pass, setIndex]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const handleActivity = () => markActivity();
    const handleHidden = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("pointerdown", handleActivity);
    document.addEventListener("visibilitychange", handleHidden);
    window.addEventListener("pagehide", flush);
    markActivity();

    const timer = window.setInterval(() => {
      const working =
        document.visibilityState === "visible" && Date.now() - lastActivityRef.current < IDLE_LIMIT_MS;
      if (!working) {
        return;
      }
      startedAtRef.current ??= new Date().toISOString();
      secondsRef.current += 1;
      setPendingSeconds(secondsRef.current);
      if (secondsRef.current >= FLUSH_EVERY_SECONDS) {
        flush();
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
      document.removeEventListener("visibilitychange", handleHidden);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [active, flush, markActivity]);

  return { pendingSeconds, markActivity };
}
