"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownText } from "@/components/markdown-text";
import { MoreMenu } from "@/components/more-menu";
import type { RoleManualKey } from "@/lib/domain/portal";
import { buildTeamApiPath } from "@/lib/domain/team";

type RoleManualCardProps = {
  teamSlug: string;
  textKey: RoleManualKey;
  title: string;
  body: string | null;
  updatedAt: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}

/**
 * 役職ごとのマニュアル1つ(2026-11-01 から)。押すと開いて読める。部員のだれでも、右上の「⋯」から書き直せる。
 * 文は Markdown で書く。
 */
export function RoleManualCard({ teamSlug, textKey, title, body, updatedAt }: RoleManualCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="tp-card tp-role-manual" id={textKey}>
      {editing ? null : (
        <MoreMenu
          label={`${title}のマニュアルの操作`}
          items={[{ label: body ? "編集" : "書く", onSelect: () => setEditing(true) }]}
        />
      )}
      <button
        type="button"
        className="tp-role-manual-head"
        aria-expanded={open || editing}
        onClick={() => setOpen((previous) => !previous)}
        disabled={editing}
      >
        <strong>{title}</strong>
        <span className="tp-small tp-muted">
          {body ? (updatedAt ? `${formatDate(updatedAt)} 更新` : "") : "まだ書かれていません"}
        </span>
      </button>

      {editing ? (
        <div className="tp-role-manual-body">
          <MarkdownEditor
            id={`text-${textKey}`}
            label={`${title}の仕事・時期ごとにやること・引き継ぎ`}
            value={draft}
            onChange={setDraft}
          />
          <div className="tp-actions">
            <button type="button" className="tp-button" disabled={saving} onClick={() => void save()}>
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
      ) : open && body ? (
        <div className="tp-role-manual-body">
          <MarkdownText text={body} />
        </div>
      ) : open ? (
        <p className="tp-small tp-muted tp-role-manual-body">まだ書かれていません。右上の「⋯」から書けます(部員ならだれでも)。</p>
      ) : null}
    </article>
  );
}
