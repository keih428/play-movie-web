"use client";

import { useRef, useState } from "react";
import type { PracticeEvent } from "@/lib/domain/calendar";
import { formatNoteDate } from "@/lib/domain/notes";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type ScheduleCalendarProps = {
  // 日曜はじまりの週ごとの日付('YYYY-MM-DD')。前後の月の日も入っている。
  weeks: string[][];
  month: string;
  today: string;
  eventsByDate: Record<string, PracticeEvent[]>;
  // 場所が書かれていない予定に出す場所(駒場)。
  defaultLocation: string;
};

function getWeekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function describeEventTime(event: PracticeEvent): string {
  return event.start ? `${event.start}〜${event.end ?? ""}` : "終日";
}

/** 予定1つの詳細(予定名・時間・場所・説明)。詳細のパネルと週の表示で使う。 */
export function EventDetail({ event, defaultLocation }: { event: PracticeEvent; defaultLocation: string }) {
  return (
    <div className="tp-event">
      <b className="tp-event-title">{event.title}</b>
      <span className="tp-event-meta">
        <span className="tp-event-time">{describeEventTime(event)}</span>
        <span>{event.location ?? defaultLocation}</span>
      </span>
      {event.description ? <p className="tp-event-desc">{event.description}</p> : null}
    </div>
  );
}

/**
 * 月のカレンダー。予定のある日を押すと、その日の予定の詳細が画面の中央に開く(部員の声、2026-10-20:
 * 「カレンダーを見る → 気になる予定を押す → すぐ詳細が分かる」)。スマホでも予定名が読めるように、マスの中は2行まで折り返す。
 */
export function ScheduleCalendar({ weeks, month, today, eventsByDate, defaultLocation }: ScheduleCalendarProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  function open(date: string) {
    setSelected(date);
    dialogRef.current?.showModal();
  }

  const selectedEvents = selected ? (eventsByDate[selected] ?? []) : [];

  return (
    <>
      <table className="tp-cal">
        <thead>
          <tr>
            {WEEKDAYS.map((label, index) => (
              <th key={label} scope="col" data-weekday={index}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((date) => {
                const events = eventsByDate[date] ?? [];
                const classNames = [
                  date.startsWith(month) ? "" : "tp-cal-out",
                  date < today ? "tp-cal-past" : "",
                  date === today ? "tp-cal-today" : "",
                  events.length > 0 ? "tp-cal-has" : "",
                ].filter(Boolean);
                const content = (
                  <>
                    <span className="tp-cal-day">{Number(date.slice(8))}</span>
                    {events.map((event, index) => (
                      <span key={index} className="tp-cal-event">
                        <b>{event.title}</b>
                        <span>{event.start ?? "終日"}</span>
                      </span>
                    ))}
                  </>
                );
                return (
                  <td key={date} className={classNames.join(" ") || undefined} data-weekday={getWeekday(date)}>
                    {events.length > 0 ? (
                      <button
                        type="button"
                        className="tp-cal-cell"
                        onClick={() => open(date)}
                        aria-label={`${formatNoteDate(date)}の予定を見る`}
                      >
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <dialog
        ref={dialogRef}
        className="tp-sheet"
        onClose={() => setSelected(null)}
        // パネルの外(暗いところ)を押しても閉じる。
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            dialogRef.current.close();
          }
        }}
      >
        {selected ? (
          <div className="tp-sheet-body">
            <div className="tp-sheet-head">
              <h3>
                {formatNoteDate(selected)}
                {selected === today ? " 今日" : ""}
              </h3>
              <button type="button" className="tp-sheet-close" onClick={() => dialogRef.current?.close()}>
                閉じる
              </button>
            </div>
            {selectedEvents.map((event, index) => (
              <EventDetail key={index} event={event} defaultLocation={defaultLocation} />
            ))}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
