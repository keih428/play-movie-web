"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  browserDraftStorage,
  draftKey,
  formatDraftTime,
  listDraftDates,
  removeDraft,
} from "@/lib/domain/drafts";
import { formatNoteDate } from "@/lib/domain/notes";
import {
  exerciseUnit,
  isEditableLogDate,
  summarizeSets,
  weightModeOf,
  type TrainingSessionRecord,
} from "@/lib/domain/training";

type TrainingLogHistoryProps = {
  teamSlug: string;
  memberId: string;
  today: string;
  // 自分の記録(新しい順)。
  sessions: TrainingSessionRecord[];
  // 記録を書く画面の URL(日付を付ける前。名簿で決まっていない段階・枠・ポジションを引き継ぐ)。
  logHref: string;
  // 記録を書く画面から戻ったときの知らせ(「保存しました」など)。
  notice: string;
};

const HISTORY_STEP = 20;
// 「記録の途中」は、新しいものから何件まで出すか。
const DRAFTS_SHOWN = 3;

/**
 * トレーニングのページの「トレ録」:記録を書く画面への入口と、自分の記録(新しい日付から順)。
 * 記録を書く画面は 2026-11-08 に分けた。保存していない記録(端末の下書き)があれば、まず「続きを書く」を出す。
 * 自分の記録は、ふだんは畳んでおく(2026-11-10 から)。
 */
export function TrainingLogHistory({
  teamSlug,
  memberId,
  today,
  sessions,
  logHref,
  notice,
}: TrainingLogHistoryProps) {
  const [drafts, setDrafts] = useState<{ date: string; savedAt: string }[]>([]);
  const [shown, setShown] = useState(HISTORY_STEP);

  // 下書きは端末にしかないので、開いたあとに読む。
  // 直せる日付(1年前から明日まで)を外れた下書きは、もう保存できないので片付ける。
  useEffect(() => {
    const storage = browserDraftStorage();
    if (!storage) {
      return;
    }
    const all = listDraftDates(storage, "training", teamSlug, memberId);
    for (const entry of all) {
      if (!isEditableLogDate(entry.date, today)) {
        removeDraft(storage, draftKey("training", teamSlug, memberId, entry.date));
      }
    }
    setDrafts(all.filter((entry) => isEditableLogDate(entry.date, today)));
  }, [teamSlug, memberId, today]);

  const hrefFor = (date: string) =>
    `${logHref}${logHref.includes("?") ? "&" : "?"}date=${date}`;

  return (
    <section id="log" className="tp-section tp-log">
      {drafts.length > 0 ? (
        <div className="tp-draftnote tp-log-resume" role="status">
          <p>
            <b>保存していない記録があります</b>
          </p>
          <ul>
            {drafts.slice(0, DRAFTS_SHOWN).map((entry) => (
              <li key={entry.date}>
                <Link className="tp-button" href={hrefFor(entry.date)}>
                  {formatNoteDate(entry.date)}の続きを書く
                </Link>
                {formatDraftTime(entry.savedAt) ? (
                  <span className="tp-small tp-muted">
                    {formatDraftTime(entry.savedAt)} まで入力
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link
        className={`tp-button tp-log-start${drafts.length > 0 ? " tp-ghost" : ""}`}
        href={hrefFor(today)}
      >
        ＋ 筋トレを記録する
      </Link>
      {notice ? <p className="tp-message">{notice}</p> : null}

      <h2>自分の記録</h2>
      {sessions.length === 0 ? (
        <p className="tp-small tp-muted">
          まだ記録はありません。筋トレをした日に、上のボタンから記録します。
        </p>
      ) : (
        // ふだんは畳んでおく(2026-11-10 から。月の後半には長くなり、下のメニューまでスクロールが大変だった)。
        <details className="tp-ref tp-log-past">
          <summary>
            {sessions.length}日分(最新:{formatNoteDate(sessions[0].date)})
          </summary>
          <div className="tp-ref-body">
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
            {sessions.length > shown ? (
              <button
                type="button"
                className="tp-button tp-ghost"
                onClick={() => setShown(shown + HISTORY_STEP)}
              >
                もっと見る
              </button>
            ) : null}
          </div>
        </details>
      )}
    </section>
  );
}
