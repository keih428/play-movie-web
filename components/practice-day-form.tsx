"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatNoteDate, type PracticeDayOverride } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";

type PracticeDayFormProps = {
  overrides: PracticeDayOverride[];
  teamSlug: string;
};

const KIND_LABELS = { off: "練習なし", extra: "練習あり" };

/** トレーニング担当用。オフの日と、いつもの曜日(日・火・木・土)以外の練習日を決める。 */
export function PracticeDayForm({ overrides, teamSlug }: PracticeDayFormProps) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"off" | "extra">("off");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(targetDate: string, targetKind: "off" | "extra" | null) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/notes/days", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: targetDate, kind: targetKind }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "変えられませんでした。");
      }
      setDate("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "変えられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(date, kind);
  }

  return (
    <div className="tp-section">
      <p className="tp-small tp-muted">
        ノートの枠は、日・火・木・土に自動でできる。オフの日は「練習なし」に、ほかの曜日の練習や試合は「練習あり」にする。
      </p>
      <form className="tp-inputs" onSubmit={submit}>
        <div className="tp-field">
          <label htmlFor="practice-date">日付</label>
          <input
            id="practice-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>
        <div className="tp-field">
          <label htmlFor="practice-kind">この日は</label>
          <select
            id="practice-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as "off" | "extra")}
          >
            <option value="off">練習なし(枠を消す)</option>
            <option value="extra">練習あり(枠を足す)</option>
          </select>
        </div>
        <div className="tp-field">
          <span>&nbsp;</span>
          <button className="tp-button tp-ghost" type="submit" disabled={busy || !date}>
            決める
          </button>
        </div>
      </form>
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
      {overrides.length > 0 ? (
        <ul className="tp-programs">
          {overrides.map((override) => (
            <li key={override.date}>
              <span>
                {override.date.slice(0, 4)}年 {formatNoteDate(override.date)} ・ {KIND_LABELS[override.kind]}
              </span>
              <button
                type="button"
                className="tp-mini"
                onClick={() => void send(override.date, null)}
                disabled={busy}
              >
                元に戻す
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
