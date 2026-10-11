"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";

/** トレーニング担当・スタッフ用。`build.py --json` で作った menu.json を読み込ませる。 */
export function TrainingMenuUpload({ teamSlug }: { teamSlug: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/training/menu", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await file.text(),
      });
      const payload = (await response.json()) as { error?: string; weeks?: number };
      if (!response.ok) {
        throw new Error(payload.error ?? "読み込めませんでした。");
      }
      setMessage(`メニューを入れ替えました(${payload.weeks}週ぶん)。`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="training-menu-file">メニューのデータ(menu.json)</label>
        <input
          id="training-menu-file"
          type="file"
          accept="application/json,.json"
          onChange={upload}
          disabled={busy}
        />
      </div>
      <p className="portal-note">
        入れ替えても、これまでの記録は消えない。種目の名前を変えると、その種目の「前回の重さ」は引き継がれない。
      </p>
      {message ? <p className="portal-message">{message}</p> : null}
      {error ? (
        <p className="portal-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
