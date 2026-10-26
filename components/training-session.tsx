"use client";

import Link from "next/link";
import { MouseEvent, useEffect, useState } from "react";
import { RichText } from "@/components/rich-text";
import { buildTeamApiPath } from "@/lib/domain/team";
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
  teamSlug: string;
  // 「これだけは欠かさないでほしい種目」(星)の名前。トレーニング担当は画面で付け外しできる(2026-10-25 から)。
  mustItems: string[];
  canMarkMust: boolean;
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
  mustItems: Set<string>;
  // トレーニング担当のときだけ渡す(星の付け外し)。
  onToggleMust?: (name: string) => void;
  busyName: string | null;
};

// メニューは読むだけ。記録は、上の「+ 筋トレを記録する」から日付ごとに入れる(2026-10-20 から)。
function DayPanel({ day, numberOffset, mustItems, onToggleMust, busyName }: DayPanelProps) {
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

  // 星:部員には付いた種目だけ「★ 欠かさない」、トレーニング担当には全部の種目に押せる ☆ / ★。
  const must = (item: ResolvedItem) => {
    // 個人の追加の種目は、その人だけのものなので星は付けない。
    if (item.personal) {
      return null;
    }
    const marked = mustItems.has(item.name);
    if (onToggleMust) {
      return (
        <button
          type="button"
          className={`tp-must tp-must-toggle${marked ? "" : " tp-must-off"}`}
          aria-pressed={marked}
          aria-label={`${item.name} を欠かさない種目に${marked ? "しない" : "する"}`}
          disabled={busyName === item.name}
          onClick={() => onToggleMust(item.name)}
        >
          {marked ? "★ 欠かさない" : "☆"}
        </button>
      );
    }
    return marked ? <span className="tp-must">★ 欠かさない</span> : null;
  };
  const hasMust = day.items.some((item) => mustItems.has(item.name));

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
                    {must(item)}
                    {item.personal ? <span className="tp-swap">個人の追加</span> : null}
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
                      {must(item)}
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

        {hasMust || onToggleMust ? (
          <p className="tp-small tp-muted">
            ★ は、これだけは欠かさないでほしい種目。
            {onToggleMust ? "☆ を押すと付き、もう一度押すと外れます(全員の画面に出ます)。" : ""}
          </p>
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
export function TrainingSession({
  children,
  teamSlug,
  mustItems: initialMustItems,
  canMarkMust,
  days,
  initialDay,
  periodLinks,
  weekLinks,
}: TrainingSessionProps) {
  const [selectedDay, setSelectedDay] = useState<TrainingDay>(initialDay);
  const [sheet, setSheet] = useState(false);
  const [mustItems, setMustItems] = useState(() => new Set(initialMustItems));
  const [busyName, setBusyName] = useState<string | null>(null);
  const [mustError, setMustError] = useState("");

  async function toggleMust(name: string) {
    setBusyName(name);
    setMustError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/training/must", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, marked: !mustItems.has(name) }),
      });
      const payload = (await response.json()) as { names?: string[]; error?: string };
      if (!response.ok || !payload.names) {
        throw new Error(payload.error ?? "星を付けられませんでした。");
      }
      setMustItems(new Set(payload.names));
    } catch (caught) {
      setMustError(caught instanceof Error ? caught.message : "星を付けられませんでした。");
    } finally {
      setBusyName(null);
    }
  }

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
        {mustError ? (
          <p className="tp-error" role="alert">
            {mustError}
          </p>
        ) : null}
        {days.map((day, dayIndex) => (
          <div key={day.day} hidden={day.day !== selectedDay}>
            <DayPanel
              day={day}
              numberOffset={days.slice(0, dayIndex).reduce((total, entry) => total + entry.items.length, 0)}
              mustItems={mustItems}
              onToggleMust={canMarkMust ? toggleMust : undefined}
              busyName={busyName}
            />
          </div>
        ))}
      </section>
    </>
  );
}
