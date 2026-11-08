"use client";

import Link from "next/link";
import { useState } from "react";
import { formatNoteDate } from "@/lib/domain/notes";
import {
  exerciseUnit,
  isEditableLogDate,
  summarizeSets,
  weightModeOf,
  type TrainingSessionRecord,
} from "@/lib/domain/training";

type TrainingLogHistoryProps = {
  today: string;
  // 自分の記録(新しい順)。
  sessions: TrainingSessionRecord[];
  // 記録を書く画面の URL(日付を付ける前。名簿で決まっていない段階・枠・ポジションを引き継ぐ)。
  logHref: string;
  // 記録を書く画面から戻ったときの知らせ(「保存しました」など)。
  notice: string;
};

const HISTORY_STEP = 20;

/**
 * トレーニングのページの「トレ録」:記録を書く画面への入口と、自分の記録(新しい日付から順)。
 * 記録を書く画面は 2026-11-08 に分けた。
 */
export function TrainingLogHistory({
  today,
  sessions,
  logHref,
  notice,
}: TrainingLogHistoryProps) {
  const [shown, setShown] = useState(HISTORY_STEP);

  const hrefFor = (date: string) =>
    `${logHref}${logHref.includes("?") ? "&" : "?"}date=${date}`;

  return (
    <section id="log" className="tp-section tp-log">
      <Link className="tp-button tp-log-start" href={hrefFor(today)}>
        ＋ 筋トレを記録する
      </Link>
      {notice ? <p className="tp-message">{notice}</p> : null}

      <h2>自分の記録</h2>
      {sessions.length === 0 ? (
        <p className="tp-small tp-muted">
          まだ記録はありません。筋トレをした日に、上のボタンから記録します。
        </p>
      ) : (
        <ol className="tp-log-history">
          {sessions.slice(0, shown).map((session) => (
            <li key={session.date} className="tp-card">
              <div className="tp-log-histhead">
                <b>【{formatNoteDate(session.date)}】</b>
                {/* 直せるのは1年前から明日まで。それより前の記録には「編集」を出さない。 */}
                {isEditableLogDate(session.date, today) ? (
                  <Link className="tp-log-edit" href={hrefFor(session.date)}>
                    編集
                  </Link>
                ) : null}
              </div>
              <ul className="tp-log-lines">
                {session.exercises.map((exercise, index) => (
                  <li key={index}>
                    {exercise.name}:
                    {summarizeSets(
                      exercise.sets,
                      weightModeOf(exercise.name),
                      exerciseUnit(exercise),
                    )}
                  </li>
                ))}
                {session.bodyWeightKg !== null ? (
                  <li>体重:{session.bodyWeightKg}kg</li>
                ) : null}
              </ul>
              {session.memo ? (
                <p className="tp-small tp-muted">{session.memo}</p>
              ) : null}
              {session.request ? (
                <p className="tp-small tp-request">{session.request}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {sessions.length > shown ? (
        <button
          type="button"
          className="tp-button tp-ghost"
          onClick={() => setShown(shown + HISTORY_STEP)}
        >
          もっと見る
        </button>
      ) : null}
    </section>
  );
}
