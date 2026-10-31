"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreMenu } from "@/components/more-menu";
import { buildTeamApiPath } from "@/lib/domain/team";

type PortalCreedProps = {
  teamSlug: string;
  slogan: string;
  philosophy: string;
  canEdit: boolean;
};

/**
 * ホームのいちばん上の、部の年間スローガンと理念(2026-11-01 から)。理念は1行に1つ。
 * 書き直せるのは幹部で、右上の「⋯」から。
 */
export function PortalCreed({ teamSlug, slogan, philosophy, canEdit }: PortalCreedProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sloganDraft, setSloganDraft] = useState(slogan);
  const [philosophyDraft, setPhilosophyDraft] = useState(philosophy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const principles = philosophy
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  async function saveText(key: "slogan" | "philosophy", body: string) {
    const response = await fetch(buildTeamApiPath("/api/portal/texts", teamSlug), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, body }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "保存できませんでした。");
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (sloganDraft.trim() !== slogan) {
        await saveText("slogan", sloganDraft);
      }
      if (philosophyDraft.trim() !== philosophy) {
        await saveText("philosophy", philosophyDraft);
      }
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="tp-creed tp-creed-editing">
        <div className="tp-field">
          <label htmlFor="creed-slogan">年間スローガン</label>
          <input id="creed-slogan" maxLength={40} value={sloganDraft} onChange={(event) => setSloganDraft(event.target.value)} />
        </div>
        <div className="tp-field">
          <label htmlFor="creed-philosophy">理念(1行に1つ)</label>
          <textarea
            id="creed-philosophy"
            rows={4}
            maxLength={400}
            value={philosophyDraft}
            onChange={(event) => setPhilosophyDraft(event.target.value)}
          />
        </div>
        <div className="tp-actions">
          <button
            type="button"
            className="tp-button"
            disabled={saving || !sloganDraft.trim() || !philosophyDraft.trim()}
            onClick={() => void save()}
          >
            {saving ? "保存しています…" : "保存する"}
          </button>
          <button
            type="button"
            className="tp-button tp-ghost"
            disabled={saving}
            onClick={() => {
              setSloganDraft(slogan);
              setPhilosophyDraft(philosophy);
              setEditing(false);
              setError("");
            }}
          >
            やめる
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

  return (
    <div className="tp-creed">
      {canEdit ? (
        <MoreMenu label="スローガンと理念の操作" items={[{ label: "書き直す", onSelect: () => setEditing(true) }]} />
      ) : null}
      <span className="tp-creed-label">年間スローガン</span>
      <p className="tp-creed-slogan">{slogan}</p>
      <span className="tp-creed-label">理念</span>
      <ol className="tp-creed-principles">
        {principles.map((principle) => (
          <li key={principle}>{principle}</li>
        ))}
      </ol>
    </div>
  );
}
