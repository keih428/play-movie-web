"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  ATTENDANCE_KINDS,
  ATTENDANCE_KIND_LABELS,
  ATTENDANCE_REASON_MAX,
  WEEKDAY_LABELS,
  describeAttendanceTime,
  needsArriveTime,
  needsLeaveTime,
  pickDatesByWeekday,
  weekdayOf,
  type AttendanceKind,
  type AttendanceReport,
} from "@/lib/domain/attendance";
import { formatNoteDate } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";

type AttendanceBulkFormProps = {
  // 予定のある練習の日(今日から3か月先まで、古い順)。
  practiceDates: string[];
  // 日付 → その日の予定(「通常練習 17:00〜21:00」)。
  eventLabels: Record<string, string>;
  myReports: AttendanceReport[];
  teamSlug: string;
};

type SlackResult = { ok: boolean; detail: string };

/**
 * 遅刻・早退・欠席の連絡を、曜日でまとめて出す(2026-11-06 から。授業で毎週火曜は 18:30 から、のような人のため)。
 * 曜日を選ぶと、3か月先までの練習の日からその曜日の日が並ぶ。外したい日は押して外し、まとめて出す。
 * もう連絡してある日は、訂正として上書きする。Slack には1通にまとめて流れる。
 */
export function AttendanceBulkForm({ practiceDates, eventLabels, myReports, teamSlug }: AttendanceBulkFormProps) {
  const router = useRouter();
  const reportByDate = new Map(myReports.map((report) => [report.practiceDate, report]));
  // 練習のある曜日だけを並べる(月曜始まり)。
  const weekdays = [1, 2, 3, 4, 5, 6, 0].filter((day) => practiceDates.some((date) => weekdayOf(date) === day));
  const [chosenDays, setChosenDays] = useState<number[]>([]);
  // 外した日。
  const [skipped, setSkipped] = useState<string[]>([]);
  const [kind, setKind] = useState<AttendanceKind>("late");
  const [arriveAt, setArriveAt] = useState("");
  const [leaveAt, setLeaveAt] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = pickDatesByWeekday(practiceDates, chosenDays);
  const dates = candidates.filter((date) => !skipped.includes(date));
  const overwriting = dates.filter((date) => reportByDate.has(date)).length;

  function toggleDay(day: number) {
    setChosenDays((previous) => (previous.includes(day) ? previous.filter((entry) => entry !== day) : [...previous, day]));
    setMessage("");
  }
  function toggleDate(date: string) {
    setSkipped((previous) => (previous.includes(date) ? previous.filter((entry) => entry !== date) : [...previous, date]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (overwriting && !window.confirm(`${overwriting}日は、もう連絡してあります。まとめて訂正します。よいですか?`)) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/attendance/bulk", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dates, kind, arriveAt, leaveAt, reason }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { count?: number; error?: string; slack?: SlackResult }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "うまくいきませんでした。もう一度試してください。");
      }
      const slack = payload?.slack && !payload.slack.ok ? `(Slack のチャンネルには流れていません:${payload.slack.detail})` : "";
      setMessage(`${payload?.count ?? dates.length}日分の連絡を出しました。${slack}`);
      setChosenDays([]);
      setSkipped([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="tp-card tp-bulk">
      <summary>
        <b>毎週の遅刻・欠席をまとめて出す</b>
        <span className="tp-small tp-muted">授業で毎週火曜は 18:30 から、のようなとき</span>
      </summary>
      <form className="tp-bulk-form" onSubmit={submit}>
        <div className="tp-field">
          <span>曜日(いくつでも)</span>
          <div className="tp-seg tp-days">
            {weekdays.map((day) => (
              <button key={day} type="button" aria-pressed={chosenDays.includes(day)} onClick={() => toggleDay(day)}>
                {WEEKDAY_LABELS[day]}
              </button>
            ))}
          </div>
        </div>

        <div className="tp-field">
          <span>連絡の種類</span>
          <div className="tp-seg tp-days">
            {ATTENDANCE_KINDS.map((entry) => (
              <button key={entry} type="button" aria-pressed={entry === kind} onClick={() => setKind(entry)}>
                {ATTENDANCE_KIND_LABELS[entry]}
              </button>
            ))}
          </div>
        </div>

        {needsArriveTime(kind) || needsLeaveTime(kind) ? (
          <div className="tp-inputs">
            {needsArriveTime(kind) ? (
              <div className="tp-field">
                <label htmlFor="bulk-arrive">何時から来られるか</label>
                <input
                  id="bulk-arrive"
                  type="time"
                  step={300}
                  value={arriveAt}
                  onChange={(event) => setArriveAt(event.target.value)}
                  required
                />
              </div>
            ) : null}
            {needsLeaveTime(kind) ? (
              <div className="tp-field">
                <label htmlFor="bulk-leave">何時までいられるか</label>
                <input
                  id="bulk-leave"
                  type="time"
                  step={300}
                  value={leaveAt}
                  onChange={(event) => setLeaveAt(event.target.value)}
                  required
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="tp-field">
          <label htmlFor="bulk-reason">理由</label>
          <textarea
            id="bulk-reason"
            rows={2}
            maxLength={ATTENDANCE_REASON_MAX}
            placeholder="例:授業(5限)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </div>

        {candidates.length ? (
          <div className="tp-field">
            <span>
              出す日({dates.length}日。押すと外す・戻す)
            </span>
            <div className="tp-chips">
              {candidates.map((date) => {
                const existing = reportByDate.get(date);
                return (
                  <button
                    key={date}
                    type="button"
                    className="tp-chip-button tp-bulk-date"
                    aria-pressed={!skipped.includes(date)}
                    title={eventLabels[date]}
                    onClick={() => toggleDate(date)}
                  >
                    {formatNoteDate(date)}
                    {existing ? (
                      <small>
                        (連絡済み:{ATTENDANCE_KIND_LABELS[existing.kind]}
                        {describeAttendanceTime(existing) ? ` ${describeAttendanceTime(existing)}` : ""})
                      </small>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : chosenDays.length ? (
          <p className="tp-small tp-muted">3か月先までに、その曜日の練習の予定はありません。</p>
        ) : null}

        {message ? <p className="tp-message">{message}</p> : null}
        {error ? (
          <p className="tp-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="tp-actions">
          <button className="tp-button" type="submit" disabled={busy || dates.length === 0 || !reason.trim()}>
            {busy ? "送信中…" : `${dates.length}日分を連絡する`}
          </button>
        </div>
        <p className="tp-small tp-muted">
          カレンダーにある、3か月先までの練習の日から選びます。それより先の分は、日が近づいたらもう一度出してください。もう連絡してある日は訂正になります。Slack には1通にまとめて流れます。
        </p>
      </form>
    </details>
  );
}
