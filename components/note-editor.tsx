"use client";

import { FormEvent, useState } from "react";
import { NOTE_BODY_MAX, NOTE_REQUEST_MAX } from "@/lib/domain/notes";
import { buildTeamApiPath, buildTeamNotesPath } from "@/lib/domain/team";

type NoteEditorProps = {
  date: string;
  initialBody: string;
  initialRequest: string;
  teamSlug: string;
};

export function NoteEditor({ date, initialBody, initialRequest, teamSlug }: NoteEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [request, setRequest] = useState(initialRequest);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/notes", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, body, request }),
      });
      const payload = (await response.json()) as { error?: string; note?: { id: string } };
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "保存できませんでした。もう一度試してください。");
      }
      window.location.assign(`${buildTeamNotesPath(teamSlug)}/${payload.note.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="tp-section">
        <div className="tp-field">
          <label htmlFor="note-body">練習で気付いたこと・次にやること(自由に)</label>
          <textarea
            id="note-body"
            rows={10}
            maxLength={NOTE_BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
        </div>
        <div className="tp-field">
          <label htmlFor="note-request">リーダーへ(反応してほしいこと。なければ空のまま)</label>
          <textarea
            id="note-request"
            rows={3}
            maxLength={NOTE_REQUEST_MAX}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
          />
        </div>
        {error ? (
          <p className="tp-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="tp-savebar">
        <p>書いたことは部の全員に見えます。あとから編集できます。</p>
        <button className="tp-button" type="submit" disabled={busy || !body.trim()}>
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}
