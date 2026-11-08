"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  browserDraftStorage,
  draftBase,
  draftKey,
  formatDraftTime,
  readDraft,
  removeDraft,
  writeDraft,
} from "@/lib/domain/drafts";
import { NOTE_BODY_MAX, NOTE_REQUEST_MAX, NOTE_TEAM_MESSAGE_MAX } from "@/lib/domain/notes";
import { buildTeamApiPath, buildTeamNotesPath } from "@/lib/domain/team";
import { JaText } from "@/components/ja-text";

type NoteFields = { body: string; request: string; teamMessage: string };

type NoteEditorProps = {
  date: string;
  memberId: string;
  initialBody: string;
  initialRequest: string;
  initialTeamMessage: string;
  // 保存してあるその日のノート(なければ null)。下書きを戻すとき、ほかの端末で保存されていないか比べる。
  // 画面の最初の中身(試合から作った下書きを含む)とは別にする(開き方で中身が変わり、誤って知らせないように)。
  savedNote: NoteFields | null;
  teamSlug: string;
};

// 「捨てる」は、戻した知らせの中と保存の欄の2か所にある。2回押しは、押した方だけ切り替える。
type DiscardPlace = "notice" | "savearea";

function isNoteFields(value: unknown): value is NoteFields {
  const fields = value as NoteFields | null;
  return (
    typeof fields === "object" &&
    fields !== null &&
    typeof fields.body === "string" &&
    typeof fields.request === "string" &&
    typeof fields.teamMessage === "string"
  );
}

/**
 * その日のノートを書く。保存ボタンは画面に固定せず、欄の最後に置く(2026-11-08 から。iOS 26 では、
 * キーボードを閉じたあと画面に固定したものがずれ、保存バーが画面の真ん中に浮いたため)。
 * 保存していない入力は端末に下書きとして残し、次に開いたときにすぐ続きから書ける(トレ録と同じ形)。
 */
export function NoteEditor({
  date,
  memberId,
  initialBody,
  initialRequest,
  initialTeamMessage,
  savedNote,
  teamSlug,
}: NoteEditorProps) {
  const initial: NoteFields = { body: initialBody, request: initialRequest, teamMessage: initialTeamMessage };
  const storageKey = draftKey("note", teamSlug, memberId, date);
  // 保存してあるノートの写し。下書きを戻すとき、ほかの端末で保存されていないか比べる。
  const serverBase = draftBase(savedNote);

  const [body, setBody] = useState(initialBody);
  const [request, setRequest] = useState(initialRequest);
  const [teamMessage, setTeamMessage] = useState(initialTeamMessage);
  const [base, setBase] = useState(serverBase);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  // 端末の下書きを確かめ終わるまでは書かない(開いた直後の中身で、残っている下書きを上書きしないように)。
  const [ready, setReady] = useState(false);
  const lastWritten = useRef("");
  const leaving = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // 「捨てる」を1回押した場所(もう一度押すと捨てる)。
  const [confirmDiscard, setConfirmDiscard] = useState<DiscardPlace | null>(null);

  const fields: NoteFields = { body, request, teamMessage };
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);

  function fill(next: NoteFields) {
    setBody(next.body);
    setRequest(next.request);
    setTeamMessage(next.teamMessage);
  }

  // 開いたときに一度だけ:端末に下書きがあれば、すぐ続きから。
  useEffect(() => {
    const storage = browserDraftStorage();
    const stored = storage ? readDraft(storage, storageKey, isNoteFields) : null;
    if (stored) {
      lastWritten.current = JSON.stringify(stored.data);
      fill(stored.data);
      setBase(stored.base);
      setRestoredAt(stored.savedAt);
      setStale(stored.base !== serverBase);
    }
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 開いたときに一度だけ

  // 何か変えたら、端末に下書きを書く。開いたときと同じ中身に戻したら消す。
  useEffect(() => {
    if (!ready || leaving.current) {
      return;
    }
    const storage = browserDraftStorage();
    if (!storage) {
      return;
    }
    const content = JSON.stringify(fields);
    if (!dirty) {
      removeDraft(storage, storageKey);
      lastWritten.current = "";
      return;
    }
    if (content === lastWritten.current) {
      return;
    }
    const ok = writeDraft(storage, storageKey, { savedAt: new Date().toISOString(), base, data: fields });
    lastWritten.current = ok ? content : "";
    setStorageFailed(!ok);
  }, [body, request, teamMessage, ready]); // eslint-disable-line react-hooks/exhaustive-deps -- 中身が変わったときだけ

  function forgetDraft() {
    const storage = browserDraftStorage();
    if (storage) {
      removeDraft(storage, storageKey);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/notes", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, body, request, teamMessage }),
      });
      const payload = (await response.json()) as { error?: string; note?: { id: string } };
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "保存できませんでした。もう一度試してください。");
      }
      // 下書きは、サーバーが受け付けてから消す(失敗したら残る)。
      leaving.current = true;
      forgetDraft();
      window.location.assign(`${buildTeamNotesPath(teamSlug)}/${payload.note.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? `${caught.message}(入力はこの端末に残っています)` : "保存できませんでした。",
      );
      setBusy(false);
    }
  }

  /**
   * 保存していない入力を捨てる。2回押し(1回目で「もう一度押すと捨てます」に変わる。うっかり押して消えないように)。
   * 捨てたら、開いたときの中身に戻す。画面を出るのは上の「戻る」(入力は端末に残る)。
   */
  function discard(place: DiscardPlace) {
    if (confirmDiscard !== place) {
      setConfirmDiscard(place);
      return;
    }
    forgetDraft();
    lastWritten.current = "";
    fill(initial);
    setBase(serverBase);
    setRestoredAt(null);
    setStale(false);
    setConfirmDiscard(null);
  }

  // 打ち直したら、「捨てる」の確かめは取り消す。
  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setConfirmDiscard(null);
    };
  }

  return (
    // 保存の通信中は、欄を触れなくする(その間に打った分は送られず、保存できると下書きごと消えるため)。
    <form onSubmit={save} inert={busy}>
      <div className="tp-section">
        {restoredAt ? (
          <div className="tp-draftnote" role="status">
            <p>
              保存していない入力を戻しました
              {formatDraftTime(restoredAt) ? `(${formatDraftTime(restoredAt)} まで)` : ""}。
            </p>
            {stale ? (
              <p>このノートは、そのあとにほかの端末などで保存されています。このまま保存すると、この入力で置き換わります。</p>
            ) : null}
            <button
              type="button"
              className={`tp-clear${confirmDiscard === "notice" ? " tp-clear-danger" : ""}`}
              onClick={() => discard("notice")}
            >
              {confirmDiscard === "notice" ? "もう一度押すと捨てます" : "捨てて、開いたときの中身に戻す"}
            </button>
          </div>
        ) : null}
        {storageFailed ? (
          <p className="tp-error" role="alert">
            この端末には下書きを残せません。保存するまで画面を閉じないでください。
          </p>
        ) : null}
        <div className="tp-field">
          <label htmlFor="note-body">練習で気付いたこと・次にやること(自由に)</label>
          <textarea
            id="note-body"
            rows={10}
            maxLength={NOTE_BODY_MAX}
            value={body}
            onChange={(event) => edit(setBody)(event.target.value)}
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
            onChange={(event) => edit(setRequest)(event.target.value)}
          />
        </div>
        <div className="tp-field">
          <label htmlFor="note-team">チームへ(チーム全体への振り返り。なければ空のまま)</label>
          <textarea
            id="note-team"
            rows={3}
            maxLength={NOTE_TEAM_MESSAGE_MAX}
            value={teamMessage}
            onChange={(event) => edit(setTeamMessage)(event.target.value)}
          />
          <small className="tp-small tp-muted">ノートのページの「チームへ」に、全員分まとめて出ます。</small>
        </div>
        {error ? (
          <p className="tp-error" role="alert">
            {error}
          </p>
        ) : null}

        {/* 保存は、欄の最後(画面には固定しない)。押すのは「保存」だけ。捨てたいときは「入力を捨てる」から。 */}
        <div className="tp-savearea">
          {dirty ? (
            <p className="tp-savearea-state">
              まだ保存していません(入力はこの端末に残っています)
              <button
                type="button"
                className={`tp-clear${confirmDiscard === "savearea" ? " tp-clear-danger" : ""}`}
                disabled={busy}
                onClick={() => discard("savearea")}
              >
                {confirmDiscard === "savearea" ? "もう一度押すと捨てます" : "入力を捨てる"}
              </button>
            </p>
          ) : null}
          <button className="tp-button" type="submit" disabled={busy || !body.trim()}>
            {busy ? "保存中…" : "保存"}
          </button>
          <p className="tp-small tp-muted">
            <JaText>書いたことは部の全員に見えます。あとから編集できます。</JaText>
          </p>
        </div>
      </div>
    </form>
  );
}
