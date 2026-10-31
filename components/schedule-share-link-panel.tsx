"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";

type ScheduleShareLinkPanelProps = {
  teamSlug: string;
  // いま有効な共有リンクのパス。発行していなければ null。
  sharePath: string | null;
};

/** 予定表の下に出す、監督向けの共有リンクの発行・作り直し・停止(システム担当だけに出す)。 */
export function ScheduleShareLinkPanel({ teamSlug, sharePath }: ScheduleShareLinkPanelProps) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = sharePath ? `${origin}${sharePath}` : "";

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/share-links", teamSlug), { method });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "うまくいきませんでした。");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function reissue() {
    if (window.confirm("リンクを作り直します。今のリンクは開けなくなるので、監督に新しいリンクを送り直してください。よいですか?")) {
      void send("POST");
    }
  }

  function revoke() {
    if (window.confirm("共有リンクを止めます。今のリンクは開けなくなります。よいですか?")) {
      void send("DELETE");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("コピーできませんでした。リンクを長押しして選んでください。");
    }
  }

  return (
    <section className="tp-section">
      <h2>監督向けの共有リンク</h2>
      <p className="tp-small tp-muted">
        ログインしない人に、この予定表だけを見せるリンク。名簿やトレーニングなど、ほかのページは見えません。検索には出ないようにしてあります。リンクを知っている人は誰でも見られるので、送る相手は監督だけにしてください。
      </p>
      {sharePath ? (
        <>
          <div className="tp-field">
            <label htmlFor="schedule-share-url">リンク</label>
            <input id="schedule-share-url" type="text" readOnly value={url} onFocus={(event) => event.target.select()} />
          </div>
          <div className="tp-actions">
            <button type="button" className="tp-button" disabled={busy || !url} onClick={copy}>
              {copied ? "コピーしました" : "コピーする"}
            </button>
            <button type="button" className="tp-button tp-ghost" disabled={busy} onClick={reissue}>
              作り直す
            </button>
            <button type="button" className="tp-button tp-ghost" disabled={busy} onClick={revoke}>
              止める
            </button>
          </div>
        </>
      ) : (
        <div className="tp-actions">
          <button type="button" className="tp-button" disabled={busy} onClick={() => void send("POST")}>
            {busy ? "発行しています…" : "リンクを発行する"}
          </button>
        </div>
      )}
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
