"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownText } from "@/components/markdown-text";
import type { PortalTextKey } from "@/lib/domain/portal";
import { buildTeamApiPath } from "@/lib/domain/team";

type PortalTextSectionProps = {
  teamSlug: string;
  textKey: PortalTextKey;
  title: string;
  hint: string;
  body: string | null;
  updatedAt: string | null;
  canEdit: boolean;
  children?: React.ReactNode;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}

/**
 * データベース/マニュアルの見出し1つ。書き直せる人(幹部・システム担当)には「書き直す」を出す。
 * 文は Markdown で書く(2026-11-01 から。改行はそのまま出る)。
 */
export function PortalTextSection({
  teamSlug,
  textKey,
  title,
  hint,
  body,
  updatedAt,
  canEdit,
  children,
}: PortalTextSectionProps) {
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
        body: JSON.stringify({ key: textKey, body: draft }),
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

  return (
    <section className="tp-section tp-manual" id={textKey}>
      <div className="tp-manual-head">
        <h2>{title}</h2>
        {canEdit && !editing ? (
          <button type="button" className="tp-button tp-ghost tp-goal-edit" onClick={() => setEditing(true)}>
            {body ? "編集" : "書く"}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="tp-card">
          <MarkdownEditor id={`text-${textKey}`} label={hint} value={draft} onChange={setDraft} rows={12} />
          <p className="tp-small tp-muted">部の全員が読めます。</p>
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
      ) : body ? (
        <div className="tp-card">
          <MarkdownText text={body} />
          {updatedAt ? <p className="tp-small tp-muted">{formatDate(updatedAt)} 更新</p> : null}
        </div>
      ) : (
        <p className="tp-small tp-muted">まだ書かれていません({hint})。</p>
      )}
      {children}
    </section>
  );
}
