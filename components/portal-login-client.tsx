"use client";

import { FormEvent, useState } from "react";
import type { LoginChoice } from "@/lib/domain/portal";
import { buildTeamApiPath } from "@/lib/domain/team";

type PortalLoginClientProps = {
  redirectTo: string;
  teamName: string;
  teamSlug: string;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "うまくいきませんでした。もう一度試してください。");
  }
  return payload;
}

function groupByGrade(members: LoginChoice[]) {
  const groups = new Map<string, LoginChoice[]>();
  for (const member of members) {
    const label = member.position && member.grade ? `${member.grade}年` : "スタッフ";
    groups.set(label, [...(groups.get(label) ?? []), member]);
  }
  return [...groups.entries()];
}

export function PortalLoginClient({ redirectTo, teamName, teamSlug }: PortalLoginClientProps) {
  const [passphrase, setPassphrase] = useState("");
  const [members, setMembers] = useState<LoginChoice[] | null>(null);
  const [rosterMarkdown, setRosterMarkdown] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function submitPassphrase(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await postJson<{ members: LoginChoice[] }>(
        buildTeamApiPath("/api/portal/login", teamSlug),
        { passphrase },
      );
      setMembers(result.members);
    });
  }

  function chooseMember(memberId: string) {
    void run(async () => {
      await postJson(buildTeamApiPath("/api/portal/login", teamSlug), { passphrase, memberId });
      window.location.assign(redirectTo);
    });
  }

  function importRoster(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await postJson<{ members: LoginChoice[] }>(
        buildTeamApiPath("/api/portal/members", teamSlug),
        { passphrase, markdown: rosterMarkdown },
      );
      setMembers(result.members);
    });
  }

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">{teamName}</span>
        <h1>部内ページ</h1>
        <p className="tp-small tp-muted">
          {members === null
            ? "トレーニングの記録や名簿は、部員とスタッフだけが見られます。"
            : members.length === 0
              ? "名簿がまだ空です。"
              : "自分の名前を選んでください。ログアウトするまで、この端末で使い続けられます。"}
        </p>
      </header>

      {members === null ? (
        <form className="tp-card" onSubmit={submitPassphrase}>
          <div className="tp-field">
            <label htmlFor="portal-passphrase">部の合言葉</label>
            <input
              id="portal-passphrase"
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              required
            />
          </div>
          <button className="tp-button" type="submit" disabled={busy || !passphrase}>
            {busy ? "確認中…" : "次へ"}
          </button>
        </form>
      ) : members.length === 0 ? (
        <form className="tp-card" onSubmit={importRoster}>
          <p>名簿の表(Markdown)をここに貼ると、最初の名簿として取り込みます。</p>
          <div className="tp-field">
            <label htmlFor="portal-roster">名簿の表</label>
            <textarea
              id="portal-roster"
              rows={10}
              placeholder={"| 名前 | 学年 | ポジション | リーダー | 役割 |\n| --- | --- | --- | --- | --- |"}
              value={rosterMarkdown}
              onChange={(event) => setRosterMarkdown(event.target.value)}
              required
            />
          </div>
          <button className="tp-button" type="submit" disabled={busy || !rosterMarkdown.trim()}>
            {busy ? "取り込み中…" : "名簿を取り込む"}
          </button>
        </form>
      ) : (
        groupByGrade(members).map(([label, group]) => (
          <section key={label} className="tp-section">
            <h3>{label}</h3>
            <div className="tp-names">
              {group.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseMember(member.id)}
                >
                  <b>{member.displayName}</b>
                  <small>{member.position ?? member.title ?? ""}</small>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {error ? (
        <p className="tp-error tp-gap" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
