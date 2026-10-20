"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PORTAL_TEXT_MAX_LENGTH } from "@/lib/domain/portal";
import { buildTeamApiPath } from "@/lib/domain/team";

type PortalGoalProps = {
  teamSlug: string;
  body: string | null;
  canEdit: boolean;
};

/** ホームに大きく出すチームの目標。書き直せる人には「書き直す」を出す。 */
export function PortalGoal({ teamSlug, body, canEdit }: PortalGoalProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/texts", teamSlug), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "goal", body: draft }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "保存できませんでした。");
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
      <div className="tp-goal">
        <div className="tp-field">
          <label htmlFor="portal-goal">チームの目標(1行目が大きく出る)</label>
          <textarea
            id="portal-goal"
            rows={5}
            maxLength={PORTAL_TEXT_MAX_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <div className="tp-actions">
          <button type="button" className="tp-button" disabled={saving} onClick={save}>
            {saving ? "保存しています…" : "保存する"}
          </button>
          <button
            type="button"
            className="tp-button tp-ghost"
            disabled={saving}
            onClick={() => {
              setDraft(body ?? "");
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

  // 1行目を大きな見出しにし、2行目からは説明として並べる。
  const [headline, ...rest] = (body ?? "").split("\n");
  const details = rest.join("\n").trim();

  return (
    <div className="tp-goal">
      <span className="tp-eyebrow">チームの目標</span>
      {body ? (
        <>
          <p className="tp-goal-headline">{headline}</p>
          {details ? <p className="tp-goal-details">{details}</p> : null}
        </>
      ) : (
        <p className="tp-muted">まだ書かれていません。</p>
      )}
      {canEdit ? (
        <div>
          <button type="button" className="tp-button tp-ghost tp-goal-edit" onClick={() => setEditing(true)}>
            {body ? "書き直す" : "目標を書く"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
