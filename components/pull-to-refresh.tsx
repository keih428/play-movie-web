"use client";

import { useEffect, useRef, useState } from "react";

// ホーム画面に追加したアプリ(全画面で開く web アプリ)では、Safari の「引っ張って更新」が効かない。
// いちばん上で下に引っ張って離すと、ページを読み込み直す(けーいちの依頼、2026-11-05)。ふつうのブラウザでは何もしない。
// 表示の動く量(指の動きの半分)がこれを超えて離すと読み込み直す。指で約 120px 引いたところ。
const READY_AT = 60;
const MAX_PULL = 90;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

/** 触った所が、それ自体で縦にスクロールできる欄(入力欄・一覧の箱など)の中なら、引っ張りとみなさない。 */
function insideScrollable(target: EventTarget | null): boolean {
  for (let node = target as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    if (node.tagName === "TEXTAREA" || node.tagName === "SELECT" || node.isContentEditable) return true;
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight && node.scrollTop > 0) {
      return true;
    }
  }
  return false;
}

export function PullToRefresh() {
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [reloading, setReloading] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    setEnabled(isStandalone());
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || event.touches.length !== 1 || insideScrollable(event.target)) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0].clientY;
    };
    const onMove = (event: TouchEvent) => {
      if (startY.current === null) return;
      const delta = event.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // 引いた量の半分だけ動かす(重みを付けて、うっかり引いたくらいでは届かないように)
      const next = Math.min(MAX_PULL, delta / 2);
      pullRef.current = next;
      setPull(next);
    };
    const onEnd = () => {
      if (startY.current !== null && pullRef.current >= READY_AT) {
        setReloading(true);
        window.location.reload();
      } else {
        setPull(0);
      }
      startY.current = null;
      pullRef.current = 0;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !reloading)) return null;
  const ready = reloading || pull >= READY_AT;
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${reloading ? 56 : pull}px)` }} role="status" aria-live="polite">
      <span className={ready ? "ptr-icon ptr-ready" : "ptr-icon"} aria-hidden="true">
        ↓
      </span>
      {reloading ? "読み込み直しています…" : ready ? "離すと読み込み直します" : "引っ張って読み込み直す"}
    </div>
  );
}
