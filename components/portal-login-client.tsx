"use client";

import { FormEvent, useState } from "react";
import type { LoginChoice } from "@/lib/domain/portal";
import { buildTeamAccountPath, buildTeamApiPath } from "@/lib/domain/team";

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
  // スタッフは、学年の並びのあとにまとめて出す。
  return [...groups.entries()].sort(
    ([left], [right]) => Number(left === "スタッフ") - Number(right === "スタッフ"),
  );
}

export function PortalLoginClient({ redirectTo, teamName, teamSlug }: PortalLoginClientProps) {
  const [passphrase, setPassphrase] = useState("");
  const [members, setMembers] = useState<LoginChoice[] | null>(null);
  // 自分の合言葉を決めている人を選んだとき、その人の合言葉を聞く。
  const [chosen, setChosen] = useState<LoginChoice | null>(null);
  const [memberPassphrase, setMemberPassphrase] = useState("");
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

  function login(memberId: string, ownPassphrase?: string) {
    void run(async () => {
      const result = await postJson<{ needsPassphraseSetup?: boolean }>(
        buildTeamApiPath("/api/portal/login", teamSlug),
        { passphrase, memberId, memberPassphrase: ownPassphrase },
      );
      // まだ自分の合言葉を決めていない人は、決めるページへ(「あとで」で元のページに戻れる)。
      window.location.assign(
        result.needsPassphraseSetup
          ? `${buildTeamAccountPath(teamSlug)}?setup=1&next=${encodeURIComponent(redirectTo)}`
          : redirectTo,
      );
    });
  }

  function chooseMember(member: LoginChoice) {
    if (member.hasPassphrase) {
      setError("");
      setMemberPassphrase("");
      setChosen(member);
      return;
    }
    login(member.id);
  }

  function submitMemberPassphrase(event: FormEvent) {
    event.preventDefault();
    if (chosen) {
      login(chosen.id, memberPassphrase);
    }
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
              : chosen
                ? `${chosen.displayName} さんが決めた、自分の合言葉を入れてください。`
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
              placeholder={"| 背番号 | 名前 | 学年 | ポジション | リーダー | 役割 |\n| --- | --- | --- | --- | --- | --- |"}
              value={rosterMarkdown}
              onChange={(event) => setRosterMarkdown(event.target.value)}
              required
            />
          </div>
          <button className="tp-button" type="submit" disabled={busy || !rosterMarkdown.trim()}>
            {busy ? "取り込み中…" : "名簿を取り込む"}
          </button>
        </form>
      ) : chosen ? (
        <form className="tp-card" onSubmit={submitMemberPassphrase}>
          <div className="tp-field">
            <label htmlFor="portal-member-passphrase">自分の合言葉</label>
            <input
              id="portal-member-passphrase"
              type="password"
              autoComplete="current-password"
              value={memberPassphrase}
              onChange={(event) => setMemberPassphrase(event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="tp-actions">
            <button className="tp-button" type="submit" disabled={busy || !memberPassphrase}>
              {busy ? "確認中…" : "ログイン"}
            </button>
            <button
              className="tp-button tp-ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                setChosen(null);
                setError("");
              }}
            >
              名前を選び直す
            </button>
          </div>
          <p className="tp-small tp-muted">忘れたときは、システム担当に消してもらうと、また名前を選ぶだけで入れます。</p>
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
                  onClick={() => chooseMember(member)}
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
