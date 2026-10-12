"use client";

export function PrintButton() {
  return (
    <button type="button" className="tp-button" onClick={() => window.print()}>
      印刷する・PDF に保存
    </button>
  );
}
