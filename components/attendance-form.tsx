"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  ATTENDANCE_KINDS,
  ATTENDANCE_KIND_LABELS,
  ATTENDANCE_REASON_MAX,
  describeAttendanceTime,
  needsArriveTime,
  needsLeaveTime,
  type AttendanceKind,
  type AttendanceReport,
} from "@/lib/domain/attendance";
import { formatNoteDate } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";

type AttendanceFormProps = {
  canTestChannel: boolean;
  initialDate: string;
  myReports: AttendanceReport[];
  practiceDates: string[];
  teamSlug: string;
  today: string;
};

type SlackResult = { ok: boolean; detail: string };

const OTHER_DATE = "other";

export function AttendanceForm({
  canTestChannel,
  initialDate,
  myReports,
  practiceDates,
  teamSlug,
  today,
}: AttendanceFormProps) {
  const router = useRouter();
  const reportByDate = new Map(myReports.map((report) => [report.practiceDate, report]));
  const initialReport = reportByDate.get(initialDate);

  const [date, setDate] = useState(initialDate);
  const [isOtherDate, setIsOtherDate] = useState(!practiceDates.includes(initialDate));
  const [kind, setKind] = useState<AttendanceKind>(initialReport?.kind ?? "absent");
  const [arriveAt, setArriveAt] = useState(initialReport?.arriveAt ?? "");
  const [leaveAt, setLeaveAt] = useState(initialReport?.leaveAt ?? "");
  const [reason, setReason] = useState(initialReport?.reason ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const existing = reportByDate.get(date);
  const apiPath = buildTeamApiPath("/api/portal/attendance", teamSlug);

  // 日付を変えたら、その日にもう出してある連絡を欄に入れる(なければ空に戻す)。
  function chooseDate(nextDate: string) {
    const report = reportByDate.get(nextDate);
    setDate(nextDate);
    setKind(report?.kind ?? "absent");
    setArriveAt(report?.arriveAt ?? "");
    setLeaveAt(report?.leaveAt ?? "");
    setReason(report?.reason ?? "");
    setMessage("");
    setError("");
  }

  function describeSlack(slack: SlackResult | undefined) {
    return slack && !slack.ok ? `(Slack のチャンネルには流れていません:${slack.detail})` : "";
  }

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

  async function request(method: string, url: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string; slack?: SlackResult };
    if (!response.ok) {
      throw new Error(payload.error ?? "うまくいきませんでした。もう一度試してください。");
    }
    return payload;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const payload = await request("POST", apiPath, { date, kind, arriveAt, leaveAt, reason });
      return `${formatNoteDate(date)}の連絡を${existing ? "訂正しました" : "出しました"}。${describeSlack(payload.slack)}`;
    });
  }

  function cancel() {
    if (!window.confirm(`${formatNoteDate(date)}の連絡を取り消します。よいですか?`)) {
      return;
    }
    void run(async () => {
      const payload = await request("DELETE", `${apiPath}&date=${date}`);
      chooseDate(date);
      setReason("");
      return `${formatNoteDate(date)}の連絡を取り消しました。${describeSlack(payload.slack)}`;
    });
  }

  function testChannel() {
    void run(async () => {
      const payload = await request("POST", apiPath, { test: true });
      return payload.slack?.ok
        ? "テストを Slack のチャンネルに流しました。"
        : `流れませんでした:${payload.slack?.detail ?? ""}`;
    });
  }

  return (
    <form className="tp-card" onSubmit={submit}>
      <div className="tp-inputs">
        <div className="tp-field">
          <label htmlFor="attendance-date">いつの練習</label>
          <select
            id="attendance-date"
            value={isOtherDate ? OTHER_DATE : date}
            onChange={(event) => {
              const value = event.target.value;
              setIsOtherDate(value === OTHER_DATE);
              chooseDate(value === OTHER_DATE ? today : value);
            }}
          >
            {practiceDates.map((entry) => (
              <option key={entry} value={entry}>
                {entry === today ? "今日 " : ""}
                {formatNoteDate(entry)}
                {reportByDate.has(entry) ? "(連絡済み)" : ""}
              </option>
            ))}
            <option value={OTHER_DATE}>ほかの日を選ぶ</option>
          </select>
        </div>
        {isOtherDate ? (
          <div className="tp-field">
            <label htmlFor="attendance-other-date">日付</label>
            <input
              id="attendance-other-date"
              type="date"
              min={today}
              value={date}
              onChange={(event) => chooseDate(event.target.value)}
              required
            />
          </div>
        ) : null}
      </div>

      <div className="tp-field">
        <span>連絡の種類</span>
        <div className="tp-seg tp-days">
          {ATTENDANCE_KINDS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={entry === kind}
              onClick={() => setKind(entry)}
            >
              {ATTENDANCE_KIND_LABELS[entry]}
            </button>
          ))}
        </div>
      </div>

      {needsArriveTime(kind) || needsLeaveTime(kind) ? (
        <div className="tp-inputs">
          {needsArriveTime(kind) ? (
            <div className="tp-field">
              <label htmlFor="attendance-arrive">何時から来られるか</label>
              <input
                id="attendance-arrive"
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
              <label htmlFor="attendance-leave">何時までいられるか</label>
              <input
                id="attendance-leave"
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
        <label htmlFor="attendance-reason">理由</label>
        <textarea
          id="attendance-reason"
          rows={2}
          maxLength={ATTENDANCE_REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </div>

      {existing ? (
        <p className="tp-small tp-muted">
          この日は、もう連絡を出してあります({ATTENDANCE_KIND_LABELS[existing.kind]}
          {describeAttendanceTime(existing) ? ` ${describeAttendanceTime(existing)}` : ""})。出し直すと訂正になります。
        </p>
      ) : null}
      {message ? <p className="tp-message">{message}</p> : null}
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tp-actions">
        <button className="tp-button" type="submit" disabled={busy || !date || !reason.trim()}>
          {busy ? "送信中…" : existing ? "訂正する" : "連絡する"}
        </button>
        {existing ? (
          <button className="tp-button tp-ghost" type="button" onClick={cancel} disabled={busy}>
            連絡を取り消す
          </button>
        ) : null}
        {canTestChannel ? (
          <button className="tp-button tp-ghost" type="button" onClick={testChannel} disabled={busy}>
            チャンネルにテストを流す
          </button>
        ) : null}
      </div>
      <p className="tp-small tp-muted">
        連絡は、Slack の遅刻・欠席のチャンネルにも流れます。名前・日付・時刻・理由は、部の全員に見えます。
      </p>
    </form>
  );
}
