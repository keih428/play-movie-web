"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatNoteDate } from "@/lib/domain/notes";
import { buildTeamApiPath } from "@/lib/domain/team";
import {
  SESSION_LIMITS,
  addDays,
  buildDefaultExercises,
  getPreviousSetsByExercise,
  inferLift,
  findVideoLink,
  exerciseUnit,
  inferUnit,
  type RepUnit,
  weightModeOf,
  type LogMenuOption,
  type SessionExercise,
  type TrainingSessionRecord,
} from "@/lib/domain/training";

type TrainingLogEditorProps = {
  teamSlug: string;
  today: string;
  // 開いたときの日付(URL の ?date=)。画面の中で日付を変えると、URL も書き換える(再読み込みしても同じ日に戻る)。
  initialDate: string;
  // 自分の記録(新しい順)。
  sessions: TrainingSessionRecord[];
  // 選べるメニュー(期間・週・曜日)。記録の欄は、選んだメニューの全部の種目に、先週(なければ前回)の重さ・回数を入れて始める。
  // メニューの種目は名前を直せず、重さと回数だけを入れる(けーいちの決定、2026-10-24)。
  menuOptions: LogMenuOption[];
  // 日付ごとの、初めに選ぶメニュー(火・木・日はその曜日、ほかの日は自主)。ない日は「メニューなし」。
  menuKeyByDate: Record<string, string>;
  // 種目の動画([種目名の一部, URL])。記録の欄の種目名の横に「▶ 動画」を出す(2026-11-05 から)。
  videoLinks: [string, string][];
  // メニューのページ(戻る先)。名簿で決まっていない段階・枠・ポジションを引き継ぐ。
  trainingHref: string;
};

// 欄の中では、数字を打ちかけの文字のまま持つ(「72.」なども打てるように)。
type DraftSet = { kg: string; reps: string };
// fixed:メニューの種目(名前は直せない)。自分で足した種目は false。
type DraftExercise = {
  key: number;
  name: string;
  lift: SessionExercise["lift"];
  // 回数の欄に入れるのが回数か秒数か(プランクなどは秒)。
  unit: RepUnit;
  // 自分で足した種目で、回/秒を手で切り替えたら true(名前を変えても決め直さない)。
  unitChosen?: boolean;
  sets: DraftSet[];
  fixed: boolean;
};
type Draft = {
  date: string;
  // 選んでいるメニュー(null は「メニューなし」:先週の同じ曜日の記録から始める)。
  menuKey: string | null;
  exercises: DraftExercise[];
  bodyWeight: string;
  memo: string;
  request: string;
};

// 選べる日:1年前から明日まで(API と同じ)。
const MAX_PAST_DAYS = 366;

let nextKey = 1;

function toText(value: number | null): string {
  return value === null ? "" : String(value);
}

function toDraftExercises(
  exercises: SessionExercise[],
  menuNames: string[] = [],
): DraftExercise[] {
  return exercises.map((exercise) => ({
    fixed: menuNames.includes(exercise.name),
    key: nextKey++,
    name: exercise.name,
    lift: exercise.lift,
    unit: exerciseUnit(exercise),
    sets: (exercise.sets.length
      ? exercise.sets
      : [{ kg: null, reps: null }]
    ).map((set) => ({
      kg: toText(set.kg),
      reps: toText(set.reps),
    })),
  }));
}

/**
 * トレ録を書く画面(日付ごと。2026-11-08 にメニューのページから分けた)。
 * ジムでやりながら記録する。保存ボタンは画面に固定せず、入力欄の最後に置く(iOS 26 では、キーボードを閉じたあと
 * 画面に固定したものがずれて、保存バーが画面の真ん中に浮いたため)。
 */
export function TrainingLogEditor({
  teamSlug,
  today,
  initialDate,
  sessions,
  menuOptions,
  menuKeyByDate,
  videoLinks,
  trainingHref,
}: TrainingLogEditorProps) {
  const router = useRouter();

  const sessionOn = (date: string) =>
    sessions.find((session) => session.date === date);

  const optionOf = (key: string | null) =>
    menuOptions.find((option) => option.key === key) ?? null;
  const menuNames = (key: string | null) =>
    optionOf(key)?.items.map((item) => item.name) ?? [];

  /** 選んだメニューの欄の最初の形(先週・前回の重さと回数を入れる)。メニューなしなら、先週の同じ曜日の記録。 */
  function exercisesFor(key: string | null, date: string): DraftExercise[] {
    const option = optionOf(key);
    const weekAgo = sessions.find(
      (session) => session.date === addDays(date, -7),
    );
    const items =
      option?.items.filter((item) => !item.name.startsWith("個人の追加")) ??
      null;
    return toDraftExercises(
      buildDefaultExercises(
        items ? { items } : null,
        getPreviousSetsByExercise(sessions, date),
        weekAgo,
      ),
      menuNames(key),
    );
  }

  function draftFor(date: string): Draft {
    const existing = sessionOn(date);
    const menuKey = menuKeyByDate[date] ?? null;
    if (existing) {
      return {
        date,
        menuKey,
        exercises: toDraftExercises(existing.exercises, menuNames(menuKey)),
        bodyWeight: toText(existing.bodyWeightKg),
        memo: existing.memo,
        request: existing.request,
      };
    }
    return {
      date,
      menuKey,
      exercises: exercisesFor(menuKey, date),
      bodyWeight: "",
      memo: "",
      request: "",
    };
  }

  const [draft, setDraft] = useState<Draft>(() => draftFor(initialDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** 日付を変える。URL も書き換える(再読み込みしても同じ日に戻る)。 */
  function changeDate(date: string) {
    setDraft(draftFor(date));
    setError("");
    setConfirmDelete(false);
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url);
  }

  /**
   * メニューを切り替える。新しいメニューの種目で作り直すが、もう打った重さ・回数(同じ名前の種目)と、
   * 自分で足した種目は残す。
   */
  function chooseMenu(key: string | null) {
    update((current) => {
      const next = exercisesFor(key, current.date).map((exercise) => {
        const typed = current.exercises.find(
          (entry) => entry.name === exercise.name,
        );
        return typed ? { ...exercise, sets: typed.sets } : exercise;
      });
      const names = new Set(next.map((exercise) => exercise.name));
      const added = current.exercises.filter(
        (exercise) => !exercise.fixed && !names.has(exercise.name),
      );
      return { ...current, menuKey: key, exercises: [...next, ...added] };
    });
  }

  function update(change: (current: Draft) => Draft) {
    setDraft((current) => change(current));
  }

  function updateExercise(
    key: number,
    change: (exercise: DraftExercise) => DraftExercise,
  ) {
    update((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.key === key ? change(exercise) : exercise,
      ),
    }));
  }

  /** メニューのページへ戻る(保存した・消したときは、そのことを出す)。 */
  function leave(params: Record<string, string> = {}) {
    const url = new URL(trainingHref, window.location.origin);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    router.push(`${url.pathname}${url.search}#log`);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        buildTeamApiPath("/api/portal/training/sessions", teamSlug),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            date: draft.date,
            exercises: draft.exercises.map((exercise) => ({
              name: exercise.name,
              lift: exercise.lift,
              ...(exercise.unit !== "reps" ? { unit: exercise.unit } : {}),
              // 自重の種目は重さを送らない(欄に「自重」と出すだけ)。チェックの種目は、やったら回数 1 だけ。
              sets:
                exercise.unit === "check"
                  ? exercise.sets.some((set) => set.reps.trim())
                    ? [{ kg: null, reps: 1 }]
                    : []
                  : exercise.sets.map((set) => ({
                      kg:
                        weightModeOf(exercise.name) === "bw"
                          ? null
                          : set.kg.trim() || null,
                      reps: set.reps.trim() || null,
                    })),
            })),
            bodyWeightKg: draft.bodyWeight.trim() || null,
            memo: draft.memo,
            request: draft.request,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "保存できませんでした。もう一度試してください。",
        );
      }
      leave({ saved: draft.date });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "保存できませんでした。",
      );
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        buildTeamApiPath(
          `/api/portal/training/sessions?date=${draft.date}`,
          teamSlug,
        ),
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "消せませんでした。");
      }
      leave({ deleted: draft.date });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "消せませんでした。");
      setBusy(false);
    }
  }

  const existing = sessionOn(draft.date);

  return (
    <form className="tp-log-editor" onSubmit={save}>
      <header className="tp-log-head">
        <Link className="tp-log-back" href={`${trainingHref}#log`}>
          ← トレーニングへ戻る
        </Link>
        <h1>{formatNoteDate(draft.date)}の記録</h1>
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
                  changeDate(date);
                }
              }}
            />
          </div>
          <p className="tp-small tp-muted">
            {existing
              ? "保存した記録を直しています。"
              : "先週(なければ前回)の重さ・回数を入れてあります。違う所だけ直してください。"}
          </p>
        </div>
      </header>

      {menuOptions.length > 0 ? (
        <div className="tp-log-menu">
          <div className="tp-field">
            <label htmlFor="log-menu-week">メニュー(何週目・何曜か)</label>
            <select
              id="log-menu-week"
              value={optionOf(draft.menuKey)?.weekKey ?? ""}
              onChange={(event) => {
                const weekKey = event.target.value;
                if (!weekKey) {
                  chooseMenu(null);
                  return;
                }
                // 週を変えたら、同じ曜日(なければその週の最初の日)を選ぶ。
                const day = optionOf(draft.menuKey)?.day;
                const inWeek = menuOptions.filter(
                  (option) => option.weekKey === weekKey,
                );
                chooseMenu(
                  (inWeek.find((option) => option.day === day) ?? inWeek[0])
                    .key,
                );
              }}
            >
              <option value="">メニューなし(先週の同じ曜日の記録から)</option>
              {menuOptions
                .filter(
                  (option, index) =>
                    menuOptions.findIndex(
                      (entry) => entry.weekKey === option.weekKey,
                    ) === index,
                )
                .map((option) => (
                  <option key={option.weekKey} value={option.weekKey}>
                    {option.weekLabel}
                  </option>
                ))}
            </select>
          </div>
          {draft.menuKey ? (
            <div className="tp-log-menu-days" role="group" aria-label="曜日">
              {menuOptions
                .filter(
                  (option) =>
                    option.weekKey === optionOf(draft.menuKey)?.weekKey,
                )
                .map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={option.key === draft.menuKey}
                    onClick={() => chooseMenu(option.key)}
                  >
                    {option.dayLabel}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
                autoFocus={
                  !exercise.name && exerciseIndex === draft.exercises.length - 1
                }
                // 名前を変えたら、集計の印(スクワット・ベンチ・トラップバーDL)は名前から決め直す。
                onChange={(event) =>
                  updateExercise(exercise.key, (current) => ({
                    ...current,
                    name: event.target.value,
                    lift: inferLift(event.target.value),
                    unit: current.unitChosen
                      ? current.unit
                      : inferUnit(event.target.value),
                  }))
                }
              />
            )}
            {findVideoLink(videoLinks, exercise.name) ? (
              <a
                className="tp-vid"
                href={findVideoLink(videoLinks, exercise.name) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${exercise.name} のフォーム動画`}
              >
                ▶ 動画
              </a>
            ) : null}
            {exercise.fixed ? null : (
              // 自分で足した種目は、回数・秒数・チェック(やったかどうか)のどれで記録するかを選べる。押すたびに切り替わる。
              <button
                type="button"
                className="tp-log-unit"
                aria-pressed={exercise.unit !== "reps"}
                onClick={() =>
                  updateExercise(exercise.key, (current) => ({
                    ...current,
                    unit:
                      current.unit === "reps"
                        ? "sec"
                        : current.unit === "sec"
                          ? "check"
                          : "reps",
                    unitChosen: true,
                  }))
                }
              >
                {exercise.unit === "sec"
                  ? "秒で記録"
                  : exercise.unit === "check"
                    ? "チェックで記録"
                    : "回で記録"}
              </button>
            )}
            <button
              type="button"
              className="tp-log-x"
              aria-label={`${exercise.name || "この種目"}を消す`}
              onClick={() =>
                update((current) => ({
                  ...current,
                  exercises: current.exercises.filter(
                    (entry) => entry.key !== exercise.key,
                  ),
                }))
              }
            >
              種目を消す
            </button>
          </div>
          {exercise.unit === "check" ? (
            // ストレッチ・ウォームアップなどは、やったかどうかだけ(けーいちの決定、2026-11-05)。
            <label className="tp-log-check">
              <input
                type="checkbox"
                checked={exercise.sets.some((set) => set.reps.trim() !== "")}
                onChange={(event) =>
                  updateExercise(exercise.key, (current) => ({
                    ...current,
                    sets: [{ kg: "", reps: event.target.checked ? "1" : "" }],
                  }))
                }
              />
              やった
            </label>
          ) : (
            <>
              <ol className="tp-log-sets">
                {exercise.sets.map((set, setIndex) => (
                  <li key={setIndex}>
                    <span className="tp-log-no">{setIndex + 1}</span>
                    {weightModeOf(exercise.name) === "bw" ? (
                      // 自重の種目は数字を打たない(けーいちの決定、2026-11-05)。
                      <span className="tp-log-bwlabel">自重 ×</span>
                    ) : (
                      <>
                        <span
                          className={
                            weightModeOf(exercise.name) === "bwplus"
                              ? "tp-log-plus"
                              : "tp-log-kg"
                          }
                        >
                          {weightModeOf(exercise.name) === "bwplus" ? (
                            <span className="tp-unit">自重+</span>
                          ) : null}
                          <input
                            inputMode="decimal"
                            aria-label={
                              weightModeOf(exercise.name) === "bwplus"
                                ? `${exercise.name} ${setIndex + 1}セット目に足した重さ(kg)`
                                : `${exercise.name} ${setIndex + 1}セット目の重さ(kg)`
                            }
                            placeholder={
                              weightModeOf(exercise.name) === "bwplus"
                                ? "0"
                                : "—"
                            }
                            value={set.kg}
                            onChange={(event) =>
                              updateExercise(exercise.key, (current) => ({
                                ...current,
                                sets: current.sets.map((entry, index) =>
                                  index === setIndex
                                    ? { ...entry, kg: event.target.value }
                                    : entry,
                                ),
                              }))
                            }
                          />
                        </span>
                        <span className="tp-unit">kg ×</span>
                      </>
                    )}
                    <input
                      inputMode="numeric"
                      aria-label={`${exercise.name} ${setIndex + 1}セット目の${exercise.unit === "sec" ? "秒数" : "回数"}`}
                      placeholder="—"
                      value={set.reps}
                      onChange={(event) =>
                        updateExercise(exercise.key, (current) => ({
                          ...current,
                          sets: current.sets.map((entry, index) =>
                            index === setIndex
                              ? { ...entry, reps: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                    <span className="tp-unit">
                      {exercise.unit === "sec" ? "秒" : "回"}
                    </span>
                    <button
                      type="button"
                      className="tp-log-x"
                      aria-label={`${setIndex + 1}セット目を消す`}
                      disabled={exercise.sets.length <= 1}
                      onClick={() =>
                        updateExercise(exercise.key, (current) => ({
                          ...current,
                          sets: current.sets.filter(
                            (_, index) => index !== setIndex,
                          ),
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
                disabled={
                  exercise.sets.length >= SESSION_LIMITS.setsPerExercise
                }
                onClick={() =>
                  updateExercise(exercise.key, (current) => ({
                    ...current,
                    // 1つ前のセットと同じ重さ・回数で足す(変えるときだけ打ち直す)。
                    sets: [
                      ...current.sets,
                      {
                        ...(current.sets[current.sets.length - 1] ?? {
                          kg: "",
                          reps: "",
                        }),
                      },
                    ],
                  }))
                }
              >
                + セット
              </button>
            </>
          )}
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
              {
                key: nextKey++,
                name: "",
                lift: null,
                unit: "reps",
                sets: [{ kg: "", reps: "" }],
                fixed: false,
              },
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
          onChange={(event) =>
            update((current) => ({
              ...current,
              bodyWeight: event.target.value,
            }))
          }
        />
      </div>
      <div className="tp-field">
        <label htmlFor="log-memo">コメント</label>
        <textarea
          id="log-memo"
          rows={2}
          value={draft.memo}
          onChange={(event) =>
            update((current) => ({ ...current, memo: event.target.value }))
          }
        />
      </div>
      <div className="tp-field">
        <label htmlFor="log-request">
          トレーニング担当へ(反応してほしいこと。なければ空のまま)
        </label>
        <textarea
          id="log-request"
          rows={2}
          value={draft.request}
          onChange={(event) =>
            update((current) => ({ ...current, request: event.target.value }))
          }
        />
      </div>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* 保存は、入力欄の最後(画面には固定しない。2026-11-08 から)。 */}
      <div className="tp-savearea">
        <button className="tp-button" type="submit" disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
        <p className="tp-small tp-muted">
          重さも回数も空のセットは、保存しません。書いたことは部の全員に見えます。
        </p>
        <button
          type="button"
          className="tp-clear tp-savearea-discard"
          disabled={busy}
          onClick={() => leave()}
        >
          やめる
        </button>
      </div>

      {existing ? (
        // 保存した記録そのものを消す(日付を間違えて保存したときなど)。保存の欄とは離し、何が消えるかを書いておく。
        <div className="tp-log-remove">
          {confirmDelete ? (
            <div className="tp-log-delete">
              <span className="tp-small">
                保存した{formatNoteDate(draft.date)}の記録を消します。部員からも見えなくなります。よければもう一度押してください。
              </span>
              <button
                type="button"
                className="tp-button tp-danger"
                disabled={busy}
                onClick={remove}
              >
                消す
              </button>
              <button
                type="button"
                className="tp-button tp-ghost"
                onClick={() => setConfirmDelete(false)}
              >
                消さない
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="tp-clear tp-clear-danger"
                onClick={() => setConfirmDelete(true)}
              >
                この日の記録を消す
              </button>
              <p className="tp-small tp-muted">
                保存した記録が消え、部員からも見えなくなります。
              </p>
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}
