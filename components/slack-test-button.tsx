"use client";

import { useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";

type Check = { step: string; ok: boolean; detail: string };

/** トレーニング担当用。自分あてにテストの DM を送り、どこで止まっているかを出す。 */
export function SlackTestButton({ teamSlug }: { teamSlug: string }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/slack-test", teamSlug), {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; checks?: Check[] };
      if (!response.ok || !payload.checks) {
        throw new Error(payload.error ?? "テストできませんでした。");
      }
      setChecks(payload.checks);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "テストできませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tp-section">
      <p className="tp-small tp-muted">
        自分あてにテストの DM を送ります。届かないときは、どこで止まっているかが下に出ます。
      </p>
      <div>
        <button type="button" className="tp-button tp-ghost" onClick={run} disabled={busy}>
          {busy ? "確かめています…" : "Slack の知らせをテストする"}
        </button>
      </div>
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
      {checks ? (
        <ol className="tp-checks">
          {checks.map((check) => (
            <li key={check.step} className={check.ok ? "tp-check-ok" : "tp-check-ng"}>
              <b>
                {check.ok ? "✓" : "✗"} {check.step}
              </b>
              <span>{check.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
