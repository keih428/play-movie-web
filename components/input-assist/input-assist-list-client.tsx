"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IaSetupEditor, type IaSetupValue } from "@/components/input-assist/ia-setup-editor";
import { createEmptySet, emptyTeam } from "@/lib/domain/input-assist/session";
import type { InputAssistSession, InputAssistSessionSummary } from "@/lib/domain/input-assist/types";
import { buildTeamApiPath, buildTeamInputAssistPath } from "@/lib/domain/team";

type InputAssistListClientProps = {
  initialSessions: InputAssistSessionSummary[];
  teamSlug: string;
  homeTeamName: string;
};

function todayInJapan(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function emptyValue(homeTeamName: string): IaSetupValue {
  return {
    title: "",
    date: todayInJapan(),
    opponent: "",
    videoPath: "",
    teams: { home: emptyTeam(homeTeamName), away: emptyTeam("相手") },
    extras: {},
    sets: [createEmptySet(1)],
  };
}

export function InputAssistListClient({ initialSessions, teamSlug, homeTeamName }: InputAssistListClientProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(initialSessions.length === 0);
  const [value, setValue] = useState<IaSetupValue>(() => emptyValue(homeTeamName));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(buildTeamApiPath("/api/input-assist/sessions", teamSlug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const payload = (await response.json().catch(() => null)) as { session?: InputAssistSession; error?: string } | null;
      if (!response.ok || !payload?.session) {
        setError(payload?.error ?? "作れませんでした。");
        return;
      }
      router.push(buildTeamInputAssistPath(teamSlug, payload.session.id));
    } catch {
      setError("作れませんでした。通信を確かめてください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell stack ia-page">
      <section className="panel">
        <div className="panel-inner stack">
          <div className="ia-header">
            <div>
              <h2 className="ia-title">打ち込み補助</h2>
              <p className="muted ia-note">
                AI の骨組みを確かめて、1回に1つずつ打ち込み、VSM に書き出します。
              </p>
            </div>
            {creating ? null : (
              <button type="button" className="button" onClick={() => setCreating(true)}>
                新しい試合
              </button>
            )}
          </div>
          {initialSessions.length === 0 ? (
            <p className="muted">まだ試合がありません。</p>
          ) : (
            <ul className="ia-session-list">
              {initialSessions.map((session) => (
                <li key={session.id}>
                  <Link href={buildTeamInputAssistPath(teamSlug, session.id)} className="list-item ia-session-item">
                    <strong>{session.title}</strong>
                    <span className="muted">
                      {session.date}
                      {session.opponent ? ` / ${session.opponent}` : ""} / {session.setCount}セット・ラリー {session.rallyCount}本
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {creating ? (
        <section className="panel">
          <div className="panel-inner stack">
            <h2>新しい試合</h2>
            <IaSetupEditor value={value} onChange={setValue} />
            {error ? <p className="ia-error">{error}</p> : null}
            <div className="button-row">
              <button type="button" className="button" onClick={() => void create()} disabled={busy || !value.title.trim()}>
                {busy ? "作っています…" : "作る"}
              </button>
              {initialSessions.length > 0 ? (
                <button type="button" className="button secondary" onClick={() => setCreating(false)}>
                  やめる
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
