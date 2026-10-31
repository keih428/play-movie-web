"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// 押すと何かをする項目か、別のページへ行く項目(href)。
type MoreMenuItem = { label: string; onSelect: () => void } | { label: string; href: string };

type MoreMenuProps = {
  // 読み上げ用の名前(例:「自分の11月のマイルストーンの操作」)。
  label: string;
  items: MoreMenuItem[];
};

/**
 * カードの右上に出す「⋯」のボタンと、押すと開く小さなメニュー(2026-10-31 から)。
 * 「書き直す」「決める」などの大きなボタンが画面を占めないようにするため。外を押すか Esc で閉じる。
 */
export function MoreMenu({ label, items }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="tp-more" ref={rootRef}>
      <button
        type="button"
        className="tp-more-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        ⋯
      </button>
      {open ? (
        <div className="tp-more-menu" role="menu">
          {items.map((item) =>
            "href" in item ? (
              <Link key={item.label} href={item.href} role="menuitem" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
