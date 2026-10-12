"use client";

import { useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";

type NoteDeleteButtonProps = {
  noteId: string;
  redirectTo: string;
  teamSlug: string;
};

/** 書いた本人とトレーニング担当に出す。消すと、付いているコメントも消える。 */
export function NoteDeleteButton({ noteId, redirectTo, teamSlug }: NoteDeleteButtonProps) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("このノートを消します。付いているコメントも消えて、元に戻せません。よいですか?")) {
      return;
    }
    setBusy(true);
    const response = await fetch(buildTeamApiPath(`/api/portal/notes/${noteId}`, teamSlug), {
      method: "DELETE",
    });
    if (response.ok) {
      window.location.assign(redirectTo);
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    window.alert(payload.error ?? "消せませんでした。もう一度試してください。");
    setBusy(false);
  }

  return (
    <button type="button" className="tp-button tp-ghost" onClick={remove} disabled={busy}>
      {busy ? "消しています…" : "このノートを消す"}
    </button>
  );
}
