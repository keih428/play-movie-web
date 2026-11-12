"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { buildTeamApiPath } from "@/lib/domain/team";
import {
  LIFT_LABELS,
  LOG_MAX_PAST_DAYS,
  addDays,
  estimate1rm,
  formatMonthDay,
  roundToPlate,
  type LiftKind,
  type Measurement,
  type MeasurementItem,
} from "@/lib/domain/training";

type TrainingMeasurementFormProps = {
  latest: Partial<Record<MeasurementItem, Measurement>>;
  teamSlug: string;
  // 今日(日本時間)。測った日の初期値と、選べるいちばん先の日。
  today: string;
};

const LIFTS: LiftKind[] = ["sq", "dl", "bp"];
const RATIO_STEPS = [1.25, 1.5, 1.75, 2];

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function describeRatio(ratio: number, bodyWeight: number, squat: number) {
  const level = ratio >= 2 ? "T3 の基準(2倍達成)" : ratio >= 1.5 ? "T2 の基準" : "T1 の基準";
  const next = RATIO_STEPS.find((step) => ratio < step);
  const rest = next
    ? `次の目安 ${next} 倍まであと ${Math.max(0, roundToPlate(next * bodyWeight - squat))} kg(推定1RM)`
    : "部の目標に到達";
  return `${ratio.toFixed(2)} 倍 ・ ${level} ・ ${rest}`;
}

export function TrainingMeasurementForm({ latest, teamSlug, today }: TrainingMeasurementFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<MeasurementItem, string>>({
    bw: "",
    sq: "",
    dl: "",
    bp: "",
  });
  // 測った日(2026-11-12 から。max を更新した日に入れそびれても、あとからその日で入れられる)。
  const [date, setDate] = useState(today);
  const [rms, setRms] = useState<Record<LiftKind, string>>({ sq: "3", dl: "3", bp: "3" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const estimated = Object.fromEntries(
    LIFTS.map((lift) => [lift, latest[lift] ? estimate1rm(latest[lift]) : null]),
  ) as Record<LiftKind, number | null>;
  const bodyWeight = latest.bw?.value ?? null;
  const ratio = estimated.sq && bodyWeight ? estimated.sq / bodyWeight : null;
  const total = estimated.sq && estimated.dl && estimated.bp ? estimated.sq + estimated.dl + estimated.bp : null;
  const hasInput = Object.values(values).some((value) => value.trim());

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
          date,
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
      setMessage(
        date === today
          ? "保存しました。メニューの重さの目安と、下の推移に反映しました。"
          : `${formatMonthDay(date)}の記録として保存しました。下の推移に反映しました。`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tp-card" onSubmit={save}>
      <div className="tp-stats">
        {LIFTS.map((lift) => {
          const measurement = latest[lift];
          return (
            <div key={lift} className="tp-stat">
              <span className="tp-l">{LIFT_LABELS[lift]} 推定1RM</span>
              <span className="tp-v">{estimated[lift] ? `${round1(estimated[lift])} kg` : "—"}</span>
              {measurement ? (
                <small>
                  {measurement.rm === 1 ? "1RM" : "3RM"} {measurement.value} ・{" "}
                  {formatMonthDay(measurement.measuredOn)}
                </small>
              ) : null}
            </div>
          );
        })}
        <div className="tp-stat">
          <span className="tp-l">筋力指数(ビッグ3 ÷ 体重)</span>
          <span className="tp-v">{total && bodyWeight ? (total / bodyWeight).toFixed(2) : "—"}</span>
          {latest.bw ? (
            <small>
              体重 {latest.bw.value} ・ {formatMonthDay(latest.bw.measuredOn)}
            </small>
          ) : null}
        </div>
      </div>

      <div>
        <p className="tp-small">
          <b>スクワットの体重比</b>{" "}
          <span className="tp-muted">
            {ratio && bodyWeight && estimated.sq
              ? describeRatio(ratio, bodyWeight, estimated.sq)
              : "体重とスクワットの3RMを入れると出ます"}
          </span>
        </p>
        <div className="tp-meter" aria-hidden="true">
          <i style={{ width: ratio ? `${Math.max(0, Math.min(100, (ratio - 1) * 100))}%` : 0 }} />
        </div>
        <div className="tp-ticks" aria-hidden="true">
          <span>1.0</span>
          <span>1.25</span>
          <span>1.5</span>
          <span>1.75</span>
          <span>2.0</span>
        </div>
      </div>

      <div className="tp-inputs">
        <div className="tp-field">
          <label htmlFor="measure-date">測った日</label>
          <input
            id="measure-date"
            type="date"
            min={addDays(today, -LOG_MAX_PAST_DAYS)}
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value || today)}
          />
        </div>
        <div className="tp-field">
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
          <div key={lift} className="tp-field">
            <label htmlFor={`measure-${lift}`}>{LIFT_LABELS[lift]}(kg)</label>
            <div className="tp-rm">
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

      {message ? <p className="tp-message">{message}</p> : null}
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button className="tp-button" type="submit" disabled={busy || !hasInput}>
          {busy ? "保存中…" : "測定を保存"}
        </button>
      </div>
    </form>
  );
}
