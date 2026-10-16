"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 開いたときに一度だけ、サーバーの表示を読み直す。上のメニュー(共通の枠)はページを移っても
 * 作り直されないので、ノートを読んだあとに、メニューの新着の数を新しくするために使う。
 */
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
