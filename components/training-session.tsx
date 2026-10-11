"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { RichText } from "@/components/rich-text";
import { buildTeamApiPath } from "@/lib/domain/team";
import {
  TRAINING_DAY_LABELS,
  formatMonthDay,
  type ResolvedDay,
  type ResolvedItem,
  type TrainingDay,
} from "@/lib/domain/training";
import type { DayRecord, WeekRecords } from "@/lib/server/portal-training-store";

export type WeekLink = {
  key: string;
  href: string;
  label: string;
  isCurrent: boolean;
  isSelected: boolean;
};

type TrainingSessionProps = {
  canRecord: boolean;
  children: React.ReactNode;
  days: ResolvedDay[];
  initialDay: TrainingDay;
  previousWeights: Record<string, number>;
  records: WeekRecords;
  teamSlug: string;
  weekLinks: WeekLink[];
  weekStart: string;
};

const WEIGHT_STEP_KG = 2.5;

// 保存した記録があればそれを、なければ目安(表の%)か前回の重さを、最初から欄に入れておく。
function getInitialWeight(
  item: ResolvedItem,
  record: DayRecord | undefined,
  previousWeights: Record<string, number>,
): string {
  if (record) {
    const saved = record.weights[item.name];
    return saved === undefined ? "" : String(saved);
  }
  const prefill = item.targetKg ?? previousWeights[item.name];
  return prefill === undefined || prefill === null ? "" : String(prefill);
}

type DayPanelProps = {
  canRecord: boolean;
  day: ResolvedDay;
  onSaved: () => void;
  previousWeights: Record<string, number>;
  record: DayRecord | undefined;
  teamSlug: string;
  weekStart: string;
};

function DayPanel({
  canRecord,
  day,
  onSaved,
  previousWeights,
  record,
  teamSlug,
  weekStart,
}: DayPanelProps) {
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      day.items
        .filter((item) => item.weighted)
        .map((item) => [item.name, getInitialWeight(item, record, previousWeights)]),
    ),
  );
  const [memo, setMemo] = useState(record?.memo ?? "");
  const [request, setRequest] = useState(record?.request ?? "");
  const [saved, setSaved] = useState(Boolean(record));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canSave = canRecord && day.items.length > 0;

  function setWeight(name: string, value: string) {
    setWeights((previous) => ({ ...previous, [name]: value }));
    setDirty(true);
  }

  function stepWeight(item: ResolvedItem, direction: 1 | -1) {
    // 続けて押しても1回ずつ効くように、いまの値は更新の中で読む。
    setWeights((previous) => {
      const current = Number.parseFloat(previous[item.name] ?? "");
      // 空の欄で押したときは、目安か前回の重さから始める。
      const next = Number.isFinite(current)
        ? Math.max(0, current + direction * WEIGHT_STEP_KG)
        : (item.targetKg ?? previousWeights[item.name] ?? 20);
      return { ...previous, [item.name]: String(next) };
    });
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
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <article className="tp-card">
        <div className="tp-dayhead">
          <span className="tp-when">{TRAINING_DAY_LABELS[day.day]}</span>
          <span className="tp-what">{day.title}</span>
          <span className="tp-time">
            {[day.date ? formatMonthDay(day.date) : "", day.time].filter(Boolean).join(" ・ ")}
          </span>
          {saved ? <span className="tp-saved">✓ 記録済み</span> : null}
        </div>

        {day.items.length > 0 ? (
          <ol className="tp-ex">
            {day.items.map((item, index) => {
              const previous = previousWeights[item.name];
              const value = weights[item.name] ?? "";
              return (
                <li key={item.name} className={item.main ? "tp-main" : undefined}>
                  <span className="tp-i">{index + 1}</span>
                  <span className="tp-n">
                    {item.name}
                    {item.swapped ? <span className="tp-swap">B枠の置き換え</span> : null}
                    {item.videoUrl ? (
                      <a
                        className="tp-vid"
                        href={item.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${item.name} のフォーム動画`}
                      >
                        ▶ 動画
                      </a>
                    ) : null}
                  </span>
                  <span className="tp-d">{item.dose}</span>
                  {item.tip ? (
                    <span className="tp-t">
                      <RichText text={item.tip} />
                    </span>
                  ) : null}

                  {canRecord && item.weighted ? (
                    <div className="tp-weight">
                      <span className="tp-stepper">
                        <button
                          type="button"
                          aria-label={`${item.name} を ${WEIGHT_STEP_KG}kg 軽く`}
                          onClick={() => stepWeight(item, -1)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="500"
                          step="0.5"
                          placeholder="—"
                          aria-label={`${item.name} の重さ(kg)`}
                          value={value}
                          onChange={(event) => setWeight(item.name, event.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={`${item.name} を ${WEIGHT_STEP_KG}kg 重く`}
                          onClick={() => stepWeight(item, 1)}
                        >
                          ＋
                        </button>
                      </span>
                      <span className="tp-unit">kg</span>
                      {item.targetKg !== null && value !== String(item.targetKg) ? (
                        <button
                          type="button"
                          className="tp-hint"
                          onClick={() => setWeight(item.name, String(item.targetKg))}
                        >
                          目安 <b>{item.targetKg}</b>
                        </button>
                      ) : null}
                      {previous !== undefined && value !== String(previous) ? (
                        <button
                          type="button"
                          className="tp-hint"
                          onClick={() => setWeight(item.name, String(previous))}
                        >
                          前回 <b>{previous}</b>
                        </button>
                      ) : null}
                      {value ? (
                        <button type="button" className="tp-clear" onClick={() => setWeight(item.name, "")}>
                          やっていない
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {day.extras.map((extra) => (
          <p key={extra} className="tp-extra">
            <RichText text={extra} />
          </p>
        ))}
      </article>

      {canSave ? (
        <>
          <div className="tp-section">
            <div className="tp-field">
              <label htmlFor={`memo-${day.day}`}>気になること(回数やセットを変えたときも、ここに)</label>
              <textarea
                id={`memo-${day.day}`}
                rows={2}
                value={memo}
                onChange={(event) => {
                  setMemo(event.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <div className="tp-field">
              <label htmlFor={`request-${day.day}`}>
                リーダー・トレーニング担当へ(反応してほしいこと。なければ空のまま)
              </label>
              <textarea
                id={`request-${day.day}`}
                rows={2}
                value={request}
                onChange={(event) => {
                  setRequest(event.target.value);
                  setDirty(true);
                }}
              />
            </div>
            {error ? (
              <p className="tp-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="tp-savebar">
            <p className={dirty ? "tp-dirty" : undefined}>
              {dirty
                ? "まだ保存していない変更があります"
                : saved
                  ? "保存してあります。書いたことは部の全員に見えます"
                  : "数字がそのとおりなら、保存を押すだけ。書いたことは部の全員に見えます"}
            </p>
            <button className="tp-button" type="submit" disabled={busy || (saved && !dirty)}>
              {busy ? "保存中…" : saved && !dirty ? "保存済み" : "保存"}
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}

/**
 * 週と曜日の切り替え(上に固定)と、その日のメニュー・記録の入力。
 * 曜日を切り替えても、ほかの曜日に打ちかけた内容は残る。
 */
export function TrainingSession({
  canRecord,
  children,
  days,
  initialDay,
  previousWeights,
  records,
  teamSlug,
  weekLinks,
  weekStart,
}: TrainingSessionProps) {
  const [selectedDay, setSelectedDay] = useState<TrainingDay>(initialDay);
  const [savedDays, setSavedDays] = useState<TrainingDay[]>(
    () => days.filter((day) => records[day.day]).map((day) => day.day),
  );

  return (
    <>
      <div className="tp-bar" role="region" aria-label="週と曜日の切り替え">
        <nav className="tp-weeks" aria-label="週">
          {weekLinks.map((week) => (
            <Link key={week.key} href={week.href} aria-current={week.isSelected ? "page" : undefined}>
              <b>{week.key}</b>
              <span className={week.isCurrent ? "tp-now" : undefined}>{week.label}</span>
            </Link>
          ))}
        </nav>
        <div className="tp-seg tp-days">
          {days.map((day) => (
            <button
              key={day.day}
              type="button"
              aria-pressed={day.day === selectedDay}
              onClick={() => {
                setSelectedDay(day.day);
                window.scrollTo({ top: 0 });
              }}
            >
              <span>
                {TRAINING_DAY_LABELS[day.day]}
                {savedDays.includes(day.day) ? <span className="tp-done"> ✓</span> : null}
              </span>
              <small>{day.date ? formatMonthDay(day.date) : "各自"}</small>
            </button>
          ))}
        </div>
      </div>

      {children}

      <section className="tp-section">
        {days.map((day) => (
          <div key={day.day} hidden={day.day !== selectedDay}>
            <DayPanel
              canRecord={canRecord}
              day={day}
              onSaved={() =>
                setSavedDays((previous) => (previous.includes(day.day) ? previous : [...previous, day.day]))
              }
              previousWeights={previousWeights}
              record={records[day.day]}
              teamSlug={teamSlug}
              weekStart={weekStart}
            />
          </div>
        ))}
      </section>
    </>
  );
}
