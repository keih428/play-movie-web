"use client";

import { FormEvent, useState } from "react";
import { RichText } from "@/components/rich-text";
import { buildTeamApiPath } from "@/lib/domain/team";
import {
  TRAINING_DAY_LABELS,
  formatMonthDay,
  type ResolvedDay,
  type ResolvedItem,
} from "@/lib/domain/training";
import type { DayRecord } from "@/lib/server/portal-training-store";

type TrainingDayFormProps = {
  canRecord: boolean;
  day: ResolvedDay;
  defaultOpen: boolean;
  previousWeights: Record<string, number>;
  record: DayRecord | undefined;
  teamSlug: string;
  weekStart: string;
};

type Prefill = { value: string; hint: string };

// 保存した記録があればそれを、なければ目安(表の%)か前回の重さを、最初から欄に入れておく。
function getPrefill(
  item: ResolvedItem,
  record: DayRecord | undefined,
  previousWeights: Record<string, number>,
): Prefill {
  if (record) {
    const saved = record.weights[item.name];
    return { value: saved === undefined ? "" : String(saved), hint: "" };
  }
  if (item.targetKg !== null) {
    return { value: String(item.targetKg), hint: "目安" };
  }
  const previous = previousWeights[item.name];
  return previous === undefined ? { value: "", hint: "" } : { value: String(previous), hint: "前回" };
}

export function TrainingDayForm({
  canRecord,
  day,
  defaultOpen,
  previousWeights,
  record,
  teamSlug,
  weekStart,
}: TrainingDayFormProps) {
  const weightedItems = day.items.filter((item) => item.weighted);
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      weightedItems.map((item) => [item.name, getPrefill(item, record, previousWeights).value]),
    ),
  );
  const [memo, setMemo] = useState(record?.memo ?? "");
  const [request, setRequest] = useState(record?.request ?? "");
  const [saved, setSaved] = useState(Boolean(record));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function change<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDirty(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/training/logs", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStart, day: day.day, weights, memo, request }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存できませんでした。もう一度試してください。");
      }
      setSaved(true);
      setDirty(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel training-day" open={defaultOpen}>
      <summary className="training-day-summary">
        <span className="training-day-when">
          {TRAINING_DAY_LABELS[day.day]}
          {day.date ? <small>{formatMonthDay(day.date)}</small> : null}
        </span>
        <span className="training-day-title">
          {day.title}
          {day.time ? <small>{day.time}</small> : null}
        </span>
        {saved ? <span className="tag">記録済み</span> : null}
      </summary>

      <form className="training-day-body stack" onSubmit={save}>
        {day.items.length > 0 ? (
          <ol className="training-items">
            {day.items.map((item, index) => {
              const prefill = getPrefill(item, record, previousWeights);
              return (
                <li key={item.name} className={item.main ? "training-item training-item-main" : "training-item"}>
                  <span className="training-item-no">{index + 1}</span>
                  <div className="training-item-text">
                    <span className="training-item-name">
                      {item.name}
                      {item.swapped ? <span className="tag">B枠</span> : null}
                    </span>
                    <span className="training-item-dose">{item.dose}</span>
                    {item.tip ? (
                      <span className="training-item-tip">
                        <RichText text={item.tip} />
                      </span>
                    ) : null}
                    {item.videoUrl ? (
                      <a
                        className="training-item-video"
                        href={item.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ▶ フォームの動画
                      </a>
                    ) : null}
                  </div>
                  {canRecord && item.weighted ? (
                    <label className="training-weight">
                      <span className="training-weight-row">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="500"
                          step="0.5"
                          aria-label={`${item.name} の重さ(kg)`}
                          value={weights[item.name] ?? ""}
                          onChange={(event) =>
                            change(setWeights, { ...weights, [item.name]: event.target.value })
                          }
                        />
                        kg
                      </span>
                      {prefill.hint && weights[item.name] === prefill.value ? (
                        <small>{prefill.hint}</small>
                      ) : null}
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {day.extras.map((extra) => (
          <p key={extra} className="training-extra">
            <RichText text={extra} />
          </p>
        ))}

        {canRecord && day.items.length > 0 ? (
          <>
            <div className="field">
              <label htmlFor={`memo-${day.day}`}>
                気になること(回数やセットを変えたときも、ここに)
              </label>
              <textarea
                id={`memo-${day.day}`}
                rows={2}
                value={memo}
                onChange={(event) => change(setMemo, event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`request-${day.day}`}>
                リーダー・トレーニング担当へ(反応してほしいこと。なければ空のまま)
              </label>
              <textarea
                id={`request-${day.day}`}
                rows={2}
                value={request}
                onChange={(event) => change(setRequest, event.target.value)}
              />
            </div>
            <p className="portal-note">
              重さを入れるのは、やった種目だけ。やっていない種目は欄を空にする。書いたことは部員とスタッフの全員に見える。
            </p>
            {error ? (
              <p className="portal-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="button-row">
              <button className="button" type="submit" disabled={busy}>
                {saved && !dirty ? "保存しました" : saved ? "保存し直す" : "保存"}
              </button>
            </div>
          </>
        ) : null}
      </form>
    </details>
  );
}
