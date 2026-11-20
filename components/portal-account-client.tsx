"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { MEMBER_PASSPHRASE_MIN_LENGTH } from "@/lib/domain/portal";
import { buildTeamApiPath } from "@/lib/domain/team";

type PortalAccountClientProps = {
  teamSlug: string;
  displayName: string;
  initialHasPassphrase: boolean;
  // ログインの直後に来たとき(まだ決めていない人)。「あとで」を出す。
  isSetup: boolean;
  returnTo: string;
};

async function sendJson<T>(url: string, method: "POST" | "DELETE", body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "うまくいきませんでした。もう一度試してください。");
  }
  return payload;
}

export function PortalAccountClient({
  teamSlug,
  displayName,
  initialHasPassphrase,
  isSetup,
  returnTo,
}: PortalAccountClientProps) {
  const [hasPassphrase, setHasPassphrase] = useState(initialHasPassphrase);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const apiPath = buildTeamApiPath("/api/portal/account/passphrase", teamSlug);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setError("確認のために入れた合言葉が、1つ目と違います。");
      return;
    }
    void run(async () => {
      await sendJson(apiPath, "POST", { current: hasPassphrase ? current : undefined, next });
      if (isSetup) {
        window.location.assign(returnTo);
        return;
      }
      setHasPassphrase(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage("自分の合言葉を保存しました。ほかの端末は、ログインし直しになります。");
    });
  }

  function remove() {
    void run(async () => {
      await sendJson(apiPath, "DELETE", { current });
      setHasPassphrase(false);
      setCurrent("");
      setMessage("自分の合言葉を消しました。名前を選ぶだけで入れるようになります。");
    });
  }

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">{displayName}</span>
        <h1>自分の合言葉</h1>
        <p className="tp-small tp-muted">
          {isSetup
            ? "部の合言葉に加えて、自分だけの合言葉を決めましょう。ほかの人があなたの名前を選んでも、入れなくなります。"
            : hasPassphrase
              ? "決めてあります。ログインで名前を選んだあとに聞かれます。"
              : "まだ決めていません。決めると、ほかの人があなたの名前を選んでも入れなくなります。"}
        </p>
      </header>

      {message ? <p className="tp-message">{message}</p> : null}

      <form className="tp-card" onSubmit={save}>
        {hasPassphrase ? (
          <div className="tp-field">
            <label htmlFor="account-current">今の合言葉</label>
            <input
              id="account-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </div>
        ) : null}
        <div className="tp-field">
          <label htmlFor="account-next">{hasPassphrase ? "新しい合言葉" : "合言葉"}</label>
          <input
            id="account-next"
            type="password"
            autoComplete="new-password"
            minLength={MEMBER_PASSPHRASE_MIN_LENGTH}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
          />
          <small className="tp-muted">{MEMBER_PASSPHRASE_MIN_LENGTH}文字以上。部の合言葉とは別のものにしてください。</small>
        </div>
        <div className="tp-field">
          <label htmlFor="account-confirm">もう一度</label>
          <input
            id="account-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </div>
        <div className="tp-actions">
          <button className="tp-button" type="submit" disabled={busy || !next || !confirm}>
            {busy ? "保存中…" : hasPassphrase ? "決め直す" : "決める"}
          </button>
          {isSetup ? (
            <Link className="tp-button tp-ghost" href={returnTo}>
              あとで
            </Link>
          ) : null}
        </div>
      </form>

      {hasPassphrase && !isSetup ? (
        <section className="tp-section">
          <h2>合言葉を消す</h2>
          <div className="tp-card">
            <p className="tp-small tp-muted">
              消すと、名前を選ぶだけで入れるようになります。上の「今の合言葉」を入れてから押してください。
            </p>
            <button className="tp-button tp-ghost" type="button" disabled={busy || !current} onClick={remove}>
              消す
            </button>
          </div>
        </section>
      ) : null}

      {!isSetup ? (
        <p className="tp-small tp-muted">
          <Link href={returnTo}>名簿に戻る</Link>
        </p>
      ) : null}

      {error ? (
        <p className="tp-error tp-gap" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
