"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DRILL_NAME_MAX, drillKindOfTab, type Drill, type StatsTab } from "@/lib/domain/drill-stats";
import { buildTeamApiPath, buildTeamStatsPath } from "@/lib/domain/team";

type DrillCreateFormProps = {
  teamSlug: string;
  today: string;
  // いまのタブ。スパイクのタブではスパイクの、サーブ・ディグのタブではサーブ・ディグのメニューを作る(2026-11-06 から)。
  tab: StatsTab;
};

// よく使うメニューの名前(タブごと。押すと名前の欄に入る)。
const NAME_SUGGESTIONS: Record<StatsTab, string[]> = {
  serve: ["サーブ練", "サーブレシーブ", "ゲーム"],
  dig: ["ディグ練", "スパレシ", "ゲーム"],
  spike: ["スパイク練習"],
  reception: ["レセプション"],
};

/** 集計するメニューを作る(スタッフ)。作ったら、そのメニューの数える画面へ移る。 */
export function DrillCreateForm({ teamSlug, today, tab }: DrillCreateFormProps) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [name, setName] = useState("");
  const kind = drillKindOfTab(tab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/drill-stats", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, name, kind }),
      });
      const payload = (await response.json().catch(() => null)) as { drill?: Drill; error?: string } | null;
      if (!response.ok || !payload?.drill) {
        throw new Error(payload?.error ?? "作れませんでした。");
      }
      // サーブ・ディグは、このタブのスキルで数えはじめる。
      router.push(`${buildTeamStatsPath(teamSlug, payload.drill.id)}${kind === "serve_dig" ? `?skill=${tab}` : ""}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "作れませんでした。");
      setBusy(false);
    }
  }

  return (
    <div className="tp-card">
      <div className="tp-inputs">
        <div className="tp-field">
          <label htmlFor="drill-date">日付</label>
          <input id="drill-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="tp-field">
          <label htmlFor="drill-name">メニューの名前</label>
          <input
            id="drill-name"
            maxLength={DRILL_NAME_MAX}
            placeholder={`例:${NAME_SUGGESTIONS[tab][0]}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>
      <div className="tp-chips">
        {NAME_SUGGESTIONS[tab].map((suggestion) => (
          <button key={suggestion} type="button" className="tp-chip-button" onClick={() => setName(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
      <div className="tp-actions">
        <button type="button" className="tp-button" disabled={busy || !name.trim() || !date} onClick={() => void create()}>
          {busy ? "作っています…" : "作って数えはじめる"}
        </button>
      </div>
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
