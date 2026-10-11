"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";

type TrainingMenuUploadProps = {
  programs: { key: string; label: string }[];
  teamSlug: string;
};

/** トレーニング担当用。`build.py --json` で作った menu.json・plan.json を読み込ませる。 */
export function TrainingMenuUpload({ programs, teamSlug }: TrainingMenuUploadProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const apiPath = buildTeamApiPath("/api/portal/training/menu", teamSlug);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await action());
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    void run(async () => {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await file.text(),
      });
      const payload = (await response.json()) as { error?: string; kind?: string; label?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "読み込めませんでした。");
      }
      return payload.kind === "plan"
        ? "年間の方針を入れ替えました。"
        : `${payload.label} のメニューを読み込みました。`;
    });
  }

  function remove(program: { key: string; label: string }) {
    if (!window.confirm(`${program.label} のメニューを消します。部員の記録は残ります。よいですか?`)) {
      return;
    }
    void run(async () => {
      const response = await fetch(`${apiPath}&key=${encodeURIComponent(program.key)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "消せませんでした。");
      }
      return `${program.label} のメニューを消しました。`;
    });
  }

  return (
    <div className="tp-section">
      <div className="tp-field">
        <label htmlFor="training-menu-file">メニュー(menu.json)か、年間の方針(plan.json)</label>
        <input
          id="training-menu-file"
          type="file"
          accept="application/json,.json"
          onChange={upload}
          disabled={busy}
        />
      </div>
      <p className="tp-small tp-muted">
        メニューは期間ごとに持つ。始まる日が同じメニューは入れ替わり、違うメニューは足される(先の期間を前もって入れておける)。入れ替えても消しても、部員の記録は残る。種目の名前を変えると、その種目の「前回の重さ」は引き継がれない。
      </p>
      {programs.length > 0 ? (
        <ul className="tp-programs">
          {programs.map((program) => (
            <li key={program.key}>
              <span>{program.label}</span>
              <button type="button" className="tp-mini" onClick={() => remove(program)} disabled={busy}>
                消す
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="tp-message">{message}</p> : null}
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
