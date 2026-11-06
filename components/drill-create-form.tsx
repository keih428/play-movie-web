"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DRILL_KINDS, DRILL_KIND_LABELS, DRILL_NAME_MAX, type Drill, type DrillKind } from "@/lib/domain/drill-stats";
import { buildTeamApiPath, buildTeamStatsPath } from "@/lib/domain/team";

type DrillCreateFormProps = {
  teamSlug: string;
  today: string;
};

// よく使うメニューの名前(押すと名前の欄に入る。種類も合わせる)。
const NAME_SUGGESTIONS: { name: string; kind: DrillKind }[] = [
  { name: "サーブ練", kind: "serve_dig" },
  { name: "サーブレシーブ", kind: "serve_dig" },
  { name: "ディグ練", kind: "serve_dig" },
  { name: "スパレシ", kind: "serve_dig" },
  { name: "ゲーム", kind: "serve_dig" },
  { name: "スパイク練習", kind: "spike" },
];

/** 集計するメニューを作る(マネージャーなど)。作ったら、そのメニューの数える画面へ移る。 */
export function DrillCreateForm({ teamSlug, today }: DrillCreateFormProps) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DrillKind>("serve_dig");
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
      router.push(buildTeamStatsPath(teamSlug, payload.drill.id));
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
            placeholder="例:サーブ練"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>
      <div className="tp-seg" role="group" aria-label="数えるもの">
        {DRILL_KINDS.map((entry) => (
          <button key={entry} type="button" aria-pressed={entry === kind} onClick={() => setKind(entry)}>
            {DRILL_KIND_LABELS[entry]}
          </button>
        ))}
      </div>
      <div className="tp-chips">
        {NAME_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            className="tp-chip-button"
            onClick={() => {
              setName(suggestion.name);
              setKind(suggestion.kind);
            }}
          >
            {suggestion.name}
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
