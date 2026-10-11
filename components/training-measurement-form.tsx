"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";
import {
  LIFT_LABELS,
  estimate1rm,
  formatMonthDay,
  type LiftKind,
  type Measurement,
  type MeasurementItem,
} from "@/lib/domain/training";

type TrainingMeasurementFormProps = {
  defaultOpen: boolean;
  latest: Partial<Record<MeasurementItem, Measurement>>;
  teamSlug: string;
};

const LIFTS: LiftKind[] = ["sq", "dl", "bp"];

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function TrainingMeasurementForm({
  defaultOpen,
  latest,
  teamSlug,
}: TrainingMeasurementFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<MeasurementItem, string>>({
    bw: "",
    sq: "",
    dl: "",
    bp: "",
  });
  const [rms, setRms] = useState<Record<LiftKind, string>>({ sq: "3", dl: "3", bp: "3" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const squat = latest.sq ? estimate1rm(latest.sq) : null;
  const ratio = squat && latest.bw ? squat / latest.bw.value : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/training/measurements", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: {
            bw: { value: values.bw },
            sq: { value: values.sq, rm: rms.sq },
            dl: { value: values.dl, rm: rms.dl },
            bp: { value: values.bp, rm: rms.bp },
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存できませんでした。");
      }
      setValues({ bw: "", sq: "", dl: "", bp: "" });
      setMessage("保存しました。メニューの重さの目安に反映されます。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel training-day" open={defaultOpen}>
      <summary className="training-day-summary">
        <span className="training-day-title">
          測定の記録(体重・3RM)
          <small>
            {ratio
              ? `スクワットの体重比 ${ratio.toFixed(2)} 倍`
              : "入れると、メイン種目の重さの目安が出る"}
          </small>
        </span>
      </summary>

      <form className="training-day-body stack" onSubmit={save}>
        <div className="training-stats">
          <div className="training-stat">
            <span>体重</span>
            <b>{latest.bw ? `${latest.bw.value} kg` : "—"}</b>
            {latest.bw ? <small>{formatMonthDay(latest.bw.measuredOn)}</small> : null}
          </div>
          {LIFTS.map((lift) => {
            const measurement = latest[lift];
            return (
              <div key={lift} className="training-stat">
                <span>{LIFT_LABELS[lift]} 推定1RM</span>
                <b>{measurement ? `${round1(estimate1rm(measurement))} kg` : "—"}</b>
                {measurement ? (
                  <small>
                    {measurement.rm === 1 ? "1RM" : "3RM"} {measurement.value} kg ・{" "}
                    {formatMonthDay(measurement.measuredOn)}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="portal-note">
          測った項目だけ入れる。今日の日付で記録される。推定1RM = 3RM × 1.1。
        </p>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="measure-bw">体重(kg)</label>
            <input
              id="measure-bw"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={values.bw}
              onChange={(event) => setValues({ ...values, bw: event.target.value })}
            />
          </div>
          {LIFTS.map((lift) => (
            <div key={lift} className="field">
              <label htmlFor={`measure-${lift}`}>{LIFT_LABELS[lift]}(kg)</label>
              <div className="training-measure-row">
                <input
                  id={`measure-${lift}`}
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={values[lift]}
                  onChange={(event) => setValues({ ...values, [lift]: event.target.value })}
                />
                <select
                  aria-label={`${LIFT_LABELS[lift]} は何回挙げた重さか`}
                  value={rms[lift]}
                  onChange={(event) => setRms({ ...rms, [lift]: event.target.value })}
                >
                  <option value="3">3RM</option>
                  <option value="1">1RM</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        {message ? <p className="portal-message">{message}</p> : null}
        {error ? (
          <p className="portal-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button className="button" type="submit" disabled={busy}>
            測定を保存
          </button>
        </div>
      </form>
    </details>
  );
}
