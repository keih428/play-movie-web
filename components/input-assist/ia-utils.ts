// 打ち込み補助の画面で使う小さな道具(時刻の書き方・キーを拾ってよいか)。

/** 動画の秒 → 「12:03.4」。 */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** 秒数 → 「3分05秒」。 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(Math.round(seconds % 60)).padStart(2, "0")}秒`;
}

/** 文字を打つ欄にいるときは、キーの操作を拾わない。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}
