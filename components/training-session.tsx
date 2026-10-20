"use client";

import Link from "next/link";
import { MouseEvent, useEffect, useState } from "react";
import { RichText } from "@/components/rich-text";
import {
  TRAINING_DAY_LABELS,
  formatMonthDay,
  type ResolvedDay,
  type ResolvedItem,
  type TrainingDay,
} from "@/lib/domain/training";

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
  children: React.ReactNode;
  days: ResolvedDay[];
  initialDay: TrainingDay;
  periodLinks: PeriodLink[];
  weekLinks: WeekLink[];
};

const SHEET_STORAGE_KEY = "teppeki.sheet";

type DayPanelProps = {
  day: ResolvedDay;
  // 単語帳の表示の通し番号(001〜)を、前の曜日からの続きにする。
  numberOffset: number;
};

// メニューは読むだけ。記録は、上の「+ 筋トレを記録する」から日付ごとに入れる(2026-10-20 から)。
function DayPanel({ day, numberOffset }: DayPanelProps) {
  // 赤シートをかけているとき、隠れた所をタップすると1つずつ見える。
  function peek(event: MouseEvent) {
    const answer = (event.target as HTMLElement).closest(".tp-ans");
    if (answer && document.querySelector(".tp")?.getAttribute("data-sheet") === "on") {
      answer.classList.toggle("tp-peek");
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
    <article className="tp-card">
        <div className="tp-dayhead">
          <span className="tp-when">{TRAINING_DAY_LABELS[day.day]}</span>
          <span className="tp-dayname">
            <span className="tp-what">{day.title}</span>
            <span className="tp-time">
              {[day.date ? formatMonthDay(day.date) : "", day.time].filter(Boolean).join(" ・ ")}
            </span>
          </span>
        </div>

        {day.items.length > 0 ? (
          <ol className="tp-ex" onClick={peek}>
            {day.items.map((item, index) => {
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
  );
}

/**
 * 週と曜日の切り替え(上に固定)と、その日のメニュー(読むだけ)。
 * 記録は、ページの上の「+ 筋トレを記録する」から日付ごとに入れる(2026-10-20 から)。
 */
export function TrainingSession({ children, days, initialDay, periodLinks, weekLinks }: TrainingSessionProps) {
  const [selectedDay, setSelectedDay] = useState<TrainingDay>(initialDay);
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
              day={day}
              numberOffset={days.slice(0, dayIndex).reduce((total, entry) => total + entry.items.length, 0)}
            />
          </div>
        ))}
      </section>
    </>
  );
}
