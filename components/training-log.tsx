"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatNoteDate } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";
import {
  SESSION_LIMITS,
  addDays,
  buildDefaultExercises,
  inferLift,
  summarizeSets,
  type SessionExercise,
  type TrainingSessionRecord,
} from "@/lib/domain/training";

type TrainingLogProps = {
  teamSlug: string;
  today: string;
  // 自分の記録(新しい順)。
  sessions: TrainingSessionRecord[];
  // 日付ごとの、記録の欄の最初の形(その日のメニューの全部の種目に、先週の重さ・回数を入れたもの)。
  // ない日(ずっと前の日)は、空から始める。
  defaultsByDate: Record<string, SessionExercise[]>;
  // 日付ごとの、その日のメニューの名前(「脚A しゃがむ動き」など)。
  menuTitles: Record<string, string>;
  // 日付ごとの、その日のメニューの種目名。メニューの種目は名前を直せず、重さと回数だけを入れる(けーいちの決定、2026-10-24)。
  menuExercisesByDate: Record<string, string[]>;
};

// 欄の中では、数字を打ちかけの文字のまま持つ(「72.」なども打てるように)。
type DraftSet = { kg: string; reps: string };
// fixed:メニューの種目(名前は直せない)。自分で足した種目は false。
type DraftExercise = { key: number; name: string; lift: SessionExercise["lift"]; sets: DraftSet[]; fixed: boolean };
type Draft = {
  date: string;
  exercises: DraftExercise[];
  bodyWeight: string;
  memo: string;
  request: string;
};

const HISTORY_STEP = 20;
// 選べる日:1年前から明日まで(API と同じ)。
const MAX_PAST_DAYS = 366;

let nextKey = 1;

function toText(value: number | null): string {
  return value === null ? "" : String(value);
}

function toDraftExercises(exercises: SessionExercise[], menuNames: string[] = []): DraftExercise[] {
  return exercises.map((exercise) => ({
    fixed: menuNames.includes(exercise.name),
    key: nextKey++,
    name: exercise.name,
    lift: exercise.lift,
    sets: (exercise.sets.length ? exercise.sets : [{ kg: null, reps: null }]).map((set) => ({
      kg: toText(set.kg),
      reps: toText(set.reps),
    })),
  }));
}

/**
 * トレーニング録(日付ごと)。「+ 筋トレを記録する」→ 日付を選ぶ → その日のメニューが入った欄を直す → 保存。
 * 保存した記録は、新しい日付から順に並ぶ。押すと直せる(部員の声、2026-10-20)。
 */
export function TrainingLog({
  teamSlug,
  today,
  sessions,
  defaultsByDate,
  menuTitles,
  menuExercisesByDate,
}: TrainingLogProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shown, setShown] = useState(HISTORY_STEP);

  const sessionOn = (date: string) => sessions.find((session) => session.date === date);

  function draftFor(date: string): Draft {
    const existing = sessionOn(date);
    if (existing) {
      return {
        date,
        exercises: toDraftExercises(existing.exercises, menuExercisesByDate[date]),
        bodyWeight: toText(existing.bodyWeightKg),
        memo: existing.memo,
        request: existing.request,
      };
    }
    const defaults = defaultsByDate[date] ?? [];
    return { date, exercises: toDraftExercises(defaults, menuExercisesByDate[date]), bodyWeight: "", memo: "", request: "" };
  }

  function open(date: string) {
    setDraft(draftFor(date));
    setError("");
    setMessage("");
    setConfirmDelete(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function update(change: (current: Draft) => Draft) {
    setDraft((current) => (current ? change(current) : current));
  }

  function updateExercise(key: number, change: (exercise: DraftExercise) => DraftExercise) {
    update((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => (exercise.key === key ? change(exercise) : exercise)),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/training/sessions", teamSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: draft.date,
          exercises: draft.exercises.map((exercise) => ({
            name: exercise.name,
            lift: exercise.lift,
            sets: exercise.sets.map((set) => ({ kg: set.kg.trim() || null, reps: set.reps.trim() || null })),
          })),
          bodyWeightKg: draft.bodyWeight.trim() || null,
          memo: draft.memo,
          request: draft.request,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存できませんでした。もう一度試してください。");
      }
      setMessage(`${formatNoteDate(draft.date)}の記録を保存しました。`);
      setDraft(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        buildTeamApiPath(`/api/portal/training/sessions?date=${draft.date}`, teamSlug),
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "消せませんでした。");
      }
      setMessage(`${formatNoteDate(draft.date)}の記録を消しました。`);
      setDraft(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "消せませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const editor = draft ? (
    <form className="tp-log-editor" onSubmit={save}>
      <div className="tp-log-date">
        <div className="tp-field">
          <label htmlFor="log-date">日付</label>
          <input
            id="log-date"
            type="date"
            value={draft.date}
            min={addDays(today, -MAX_PAST_DAYS)}
            max={addDays(today, 1)}
            onChange={(event) => {
              const date = event.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                setDraft(draftFor(date));
                setConfirmDelete(false);
              }
            }}
          />
        </div>
        <p className="tp-small tp-muted">
          {sessionOn(draft.date)
            ? "この日の記録を編集します。"
            : "新しい記録です。重さと回数は、先週(なければ前回)の記録を入れてあります。違うところだけ直してください。"}
          {menuTitles[draft.date] ? ` メニュー:${menuTitles[draft.date]}` : ""}
        </p>
      </div>

      {draft.exercises.map((exercise, exerciseIndex) => (
        <div
          key={exercise.key}
          role="group"
          aria-label={exercise.name || "種目"}
          className="tp-log-ex"
        >
          <div className="tp-log-exhead">
            {exercise.fixed ? (
              <b className="tp-log-name-fixed">{exercise.name}</b>
            ) : (
              <input
                className="tp-log-name"
                aria-label="種目名"
                placeholder="種目名"
                maxLength={SESSION_LIMITS.nameLength}
                value={exercise.name}
                autoFocus={!exercise.name && exerciseIndex === draft.exercises.length - 1}
                // 名前を変えたら、集計の印(スクワット・ベンチ・トラップバーDL)は名前から決め直す。
                onChange={(event) =>
                  updateExercise(exercise.key, (current) => ({
                    ...current,
                    name: event.target.value,
                    lift: inferLift(event.target.value),
                  }))
                }
              />
            )}
            <button
              type="button"
              className="tp-log-x"
              aria-label={`${exercise.name || "この種目"}を消す`}
              onClick={() =>
                update((current) => ({
                  ...current,
                  exercises: current.exercises.filter((entry) => entry.key !== exercise.key),
                }))
              }
            >
              種目を消す
            </button>
          </div>
          <ol className="tp-log-sets">
            {exercise.sets.map((set, setIndex) => (
              <li key={setIndex}>
                <span className="tp-log-no">{setIndex + 1}</span>
                <input
                  inputMode="decimal"
                  aria-label={`${exercise.name} ${setIndex + 1}セット目の重さ(kg)`}
                  placeholder="—"
                  value={set.kg}
                  onChange={(event) =>
                    updateExercise(exercise.key, (current) => ({
                      ...current,
                      sets: current.sets.map((entry, index) =>
                        index === setIndex ? { ...entry, kg: event.target.value } : entry,
                      ),
                    }))
                  }
                />
                <span className="tp-unit">kg ×</span>
                <input
                  inputMode="numeric"
                  aria-label={`${exercise.name} ${setIndex + 1}セット目の回数`}
                  placeholder="—"
                  value={set.reps}
                  onChange={(event) =>
                    updateExercise(exercise.key, (current) => ({
                      ...current,
                      sets: current.sets.map((entry, index) =>
                        index === setIndex ? { ...entry, reps: event.target.value } : entry,
                      ),
                    }))
                  }
                />
                <span className="tp-unit">回</span>
                <button
                  type="button"
                  className="tp-log-x"
                  aria-label={`${setIndex + 1}セット目を消す`}
                  disabled={exercise.sets.length <= 1}
                  onClick={() =>
                    updateExercise(exercise.key, (current) => ({
                      ...current,
                      sets: current.sets.filter((_, index) => index !== setIndex),
                    }))
                  }
                >
                  −
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="tp-log-add"
            disabled={exercise.sets.length >= SESSION_LIMITS.setsPerExercise}
            onClick={() =>
              updateExercise(exercise.key, (current) => ({
                ...current,
                // 1つ前のセットと同じ重さ・回数で足す(変えるときだけ打ち直す)。
                sets: [...current.sets, { ...(current.sets[current.sets.length - 1] ?? { kg: "", reps: "" }) }],
              }))
            }
          >
            + セット
          </button>
        </div>
      ))}

      <button
        type="button"
        className="tp-button tp-ghost"
        disabled={draft.exercises.length >= SESSION_LIMITS.exercises}
        onClick={() =>
          update((current) => ({
            ...current,
            exercises: [
              ...current.exercises,
              { key: nextKey++, name: "", lift: null, sets: [{ kg: "", reps: "" }], fixed: false },
            ],
          }))
        }
      >
        + 種目を足す
      </button>

      <div className="tp-field tp-log-bw">
        <label htmlFor="log-bw">体重(kg)</label>
        <input
          id="log-bw"
          inputMode="decimal"
          placeholder="—"
          value={draft.bodyWeight}
          onChange={(event) => update((current) => ({ ...current, bodyWeight: event.target.value }))}
        />
      </div>
      <div className="tp-field">
        <label htmlFor="log-memo">気になること</label>
        <textarea
          id="log-memo"
          rows={2}
          value={draft.memo}
          onChange={(event) => update((current) => ({ ...current, memo: event.target.value }))}
        />
      </div>
      <div className="tp-field">
        <label htmlFor="log-request">トレーニング担当へ(反応してほしいこと。なければ空のまま)</label>
        <textarea
          id="log-request"
          rows={2}
          value={draft.request}
          onChange={(event) => update((current) => ({ ...current, request: event.target.value }))}
        />
      </div>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tp-savebar">
        <p>重さも回数も空のセットは、保存しません。書いたことは部の全員に見えます。</p>
        <div className="tp-actions">
          <button type="button" className="tp-button tp-ghost" disabled={busy} onClick={() => setDraft(null)}>
            やめる
          </button>
          <button className="tp-button" type="submit" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {sessionOn(draft.date) ? (
        <div className="tp-log-delete">
          {confirmDelete ? (
            <>
              <span className="tp-small">この日の記録を消します。よければもう一度押してください。</span>
              <button type="button" className="tp-button tp-danger" disabled={busy} onClick={remove}>
                消す
              </button>
              <button type="button" className="tp-button tp-ghost" onClick={() => setConfirmDelete(false)}>
                やめる
              </button>
            </>
          ) : (
            <button type="button" className="tp-clear" onClick={() => setConfirmDelete(true)}>
              この日の記録を消す
            </button>
          )}
        </div>
      ) : null}
    </form>
  ) : null;

  return (
    <section className="tp-section tp-log">
      {draft ? (
        editor
      ) : (
        <button type="button" className="tp-button tp-log-start" onClick={() => open(today)}>
          ＋ 筋トレを記録する
        </button>
      )}
      {message ? <p className="tp-message">{message}</p> : null}

      <h2>自分の記録</h2>
      {sessions.length === 0 ? (
        <p className="tp-small tp-muted">まだ記録はありません。筋トレをした日に、上のボタンから記録します。</p>
      ) : (
        <ol className="tp-log-history">
          {sessions.slice(0, shown).map((session) => (
            <li key={session.date} className="tp-card">
              <div className="tp-log-histhead">
                <b>【{formatNoteDate(session.date)}】</b>
                <button type="button" className="tp-log-edit" onClick={() => open(session.date)}>
                  編集
                </button>
              </div>
              <ul className="tp-log-lines">
                {session.exercises.map((exercise, index) => (
                  <li key={index}>
                    {exercise.name}:{summarizeSets(exercise.sets)}
                  </li>
                ))}
                {session.bodyWeightKg !== null ? <li>体重:{session.bodyWeightKg}kg</li> : null}
              </ul>
              {session.memo ? <p className="tp-small tp-muted">{session.memo}</p> : null}
              {session.request ? <p className="tp-small tp-request">{session.request}</p> : null}
            </li>
          ))}
        </ol>
      )}
      {sessions.length > shown ? (
        <button type="button" className="tp-button tp-ghost" onClick={() => setShown(shown + HISTORY_STEP)}>
          もっと見る
        </button>
      ) : null}
    </section>
  );
}
