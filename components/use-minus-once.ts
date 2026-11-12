"use client";

import { useEffect, useState } from "react";

// 「−1」を押したまま何もしなければ、この時間で元に戻す(入れっぱなしで数え始めてしまわないように)。
const MINUS_TIMEOUT_MS = 5000;

/**
 * 集計の数える画面の「−1」(2026-11-12 から。けーいちの依頼:「戻す」だけでなく、どのマスでも減らせるように)。
 * 押すと次の1回だけ減らす状態になり、マスを1つ押すと(consume)すぐ元に戻る。5秒なにもしなくても戻る。
 * 「戻す」は自分が押した分しか戻せず、開き直すと使えないので、ほかの人が押した分や前の分はこれで直す。
 */
export function useMinusOnce() {
  const [minus, setMinus] = useState(false);

  useEffect(() => {
    if (!minus) {
      return;
    }
    const timer = setTimeout(() => setMinus(false), MINUS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [minus]);

  return {
    minus,
    toggleMinus: () => setMinus((previous) => !previous),
    /** マスを押したときに呼ぶ。減らす状態だったかを返し、元に戻す。 */
    consumeMinus: (): boolean => {
      if (minus) {
        setMinus(false);
      }
      return minus;
    },
  };
}
