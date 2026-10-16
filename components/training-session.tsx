"use client";

import Link from "next/link";
import { FormEvent, MouseEvent, useEffect, useState } from "react";
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

export type PeriodLink = {
  key: string;
  href: string;
  label: string;
  status: "past" | "current" | "upcoming";
  isSelected: boolean;
};

const PERIOD_STATUS_LABELS: Record<PeriodLink["status"], string> = {
  past: "これまで",
  current: "いま",
  upcoming: "これから",
};

type TrainingSessionProps = {
  canRecord: boolean;
  children: React.ReactNode;
  days: ResolvedDay[];
  initialDay: TrainingDay;
  periodLinks: PeriodLink[];
  previousWeights: Record<string, number>;
  records: WeekRecords;
  teamSlug: string;
  weekLinks: WeekLink[];
  weekStart: string;
};

const WEIGHT_STEP_KG = 2.5;
const SHEET_STORAGE_KEY = "teppeki.sheet";

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
  // 単語帳の表示の通し番号(001〜)を、前の曜日からの続きにする。
  numberOffset: number;
  onSaved: () => void;
  previousWeights: Record<string, number>;
  record: DayRecord | undefined;
  teamSlug: string;
  weekStart: string;
};

function DayPanel({
  canRecord,
  day,
  numberOffset,
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

  // 赤シートをかけているとき、隠れた所をタップすると1つずつ見える。
  function peek(event: MouseEvent) {
    const answer = (event.target as HTMLElement).closest(".tp-ans");
    if (answer && document.querySelector(".tp")?.getAttribute("data-sheet") === "on") {
      answer.classList.toggle("tp-peek");
    }
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

  const video = (item: ResolvedItem) =>
    item.videoUrl ? (
      <a
        className="tp-vid"
        href={item.videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${item.name} のフォーム動画`}
      >
        ▶ 動画
      </a>
    ) : null;

  return (
    <form onSubmit={save}>
      <article className="tp-card">
        <div className="tp-dayhead">
          <span className="tp-when">{TRAINING_DAY_LABELS[day.day]}</span>
          <span className="tp-dayname">
            <span className="tp-what">{day.title}</span>
            <span className="tp-time">
              {[day.date ? formatMonthDay(day.date) : "", day.time].filter(Boolean).join(" ・ ")}
            </span>
          </span>
          {saved ? <span className="tp-saved">✓ 記録済み</span> : null}
        </div>

        {day.items.length > 0 ? (
          <ol className="tp-ex" onClick={peek}>
            {day.items.map((item, index) => {
              const previous = previousWeights[item.name];
              const value = weights[item.name] ?? "";
              return (
                <li key={item.name} className={item.main ? "tp-main" : undefined}>
                  <span className="tp-i tp-std-only">{index + 1}</span>
                  <span className="tp-n tp-std-only">
                    {item.name}
                    {item.swapped ? <span className="tp-swap">C枠の置き換え</span> : null}
                    {video(item)}
                  </span>
                  <span className="tp-d tp-std-only">{item.dose}</span>
                  {item.tip ? (
                    <span className="tp-t tp-std-only">
                      <RichText text={item.tip} />
                    </span>
                  ) : null}

                  <div className="tp-ent tp-tango-only">
                    <div className="tp-eh">
                      <span className="tp-no">{String(numberOffset + index + 1).padStart(3, "0")}</span>
                      <span className="tp-hw">{item.english ? item.english[0] : item.name}</span>
                      {item.english ? <span className="tp-pr">{item.english[1]}</span> : null}
                    </div>
                    <div className="tp-em">
                      <span className="tp-pos">名</span>
                      <span className="tp-ja">{item.name}</span>
                      {video(item)}
                      {item.swapped ? <span className="tp-swaptag">C枠</span> : null}
                      {item.dose ? <span className="tp-ans">{item.dose}</span> : null}
                    </div>
                    {item.tip ? (
                      <p className="tp-exl">
                        <RichText text={item.tip} />
                      </p>
                    ) : null}
                  </div>

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
                トレーニング担当へ(反応してほしいこと。なければ空のまま)
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
  periodLinks,
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
  const [sheet, setSheet] = useState(false);

  // 赤シート(単語帳の表示で、回数と重さを隠す)。端末ごとに覚える。
  useEffect(() => {
    try {
      setSheet(window.localStorage.getItem(SHEET_STORAGE_KEY) === "on");
    } catch {
      // 保存場所が使えない端末では、毎回オフから始める。
    }
  }, []);
  useEffect(() => {
    document.querySelector(".tp")?.setAttribute("data-sheet", sheet ? "on" : "off");
    document.querySelectorAll(".tp-peek").forEach((element) => element.classList.remove("tp-peek"));
  }, [sheet]);

  function toggleSheet() {
    const next = !sheet;
    setSheet(next);
    try {
      window.localStorage.setItem(SHEET_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // 覚えられなくても、この画面では切り替わる。
    }
  }

  return (
    <>
      <div className="tp-bar" role="region" aria-label="週と曜日の切り替え">
        {periodLinks.length > 1 ? (
          <nav className="tp-weeks tp-periods" aria-label="期間">
            {periodLinks.map((period) => (
              <Link
                key={period.key}
                href={period.href}
                aria-current={period.isSelected ? "page" : undefined}
              >
                <b>{period.label}</b>
                <span className={period.status === "current" ? "tp-now" : undefined}>
                  {PERIOD_STATUS_LABELS[period.status]}
                </span>
              </Link>
            ))}
          </nav>
        ) : null}
        <nav className="tp-weeks" aria-label="週">
          {weekLinks.map((week) => (
            <Link key={week.key} href={week.href} aria-current={week.isSelected ? "page" : undefined}>
              <b>{week.key}</b>
              <span className={week.isCurrent ? "tp-now" : undefined}>{week.label}</span>
            </Link>
          ))}
        </nav>
        <div className="tp-dayrow">
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
        <button
          type="button"
          className="tp-sheetbtn tp-tango-only"
          aria-pressed={sheet}
          onClick={toggleSheet}
        >
          赤シート
        </button>
        </div>
      </div>

      {children}

      <section className="tp-section">
        {days.map((day, dayIndex) => (
          <div key={day.day} hidden={day.day !== selectedDay}>
            <DayPanel
              canRecord={canRecord}
              day={day}
              numberOffset={days.slice(0, dayIndex).reduce((total, entry) => total + entry.items.length, 0)}
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
