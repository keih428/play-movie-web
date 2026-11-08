"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { RichText } from "@/components/rich-text";
import {
  browserDraftStorage,
  draftBase,
  draftKey,
  formatDraftTime,
  readDraft,
  removeDraft,
  writeDraft,
} from "@/lib/domain/drafts";
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
  isEditableLogDate,
  LOG_MAX_PAST_DAYS,
  type RepUnit,
  weightModeOf,
  type LogMenuItem,
  type LogMenuOption,
  type SessionExercise,
  type TrainingSessionRecord,
} from "@/lib/domain/training";

type TrainingLogEditorProps = {
  teamSlug: string;
  memberId: string;
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
  // 「これだけは欠かさない」種目(★)の名前。
  mustItems: string[];
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
// 端末に残す形(種目の key は画面の中だけのもの。戻すときに付け直す)。
type StoredContent = Omit<Draft, "exercises"> & { exercises: Omit<DraftExercise, "key">[] };


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

function contentOf(draft: Draft): StoredContent {
  return {
    ...draft,
    exercises: draft.exercises.map(({ name, lift, unit, unitChosen, sets, fixed }) => ({
      name,
      lift,
      unit,
      ...(unitChosen ? { unitChosen } : {}),
      sets,
      fixed,
    })),
  };
}

function fromContent(content: StoredContent): Draft {
  return {
    ...content,
    exercises: content.exercises.map((exercise) => ({ ...exercise, key: nextKey++ })),
  };
}

/** 下書きを比べるための形(何も変えていなければ、開いたときと同じ文字になる)。 */
function serialize(draft: Draft): string {
  return JSON.stringify(contentOf(draft));
}

function isStoredContent(value: unknown): value is StoredContent {
  const content = value as StoredContent | null;
  return (
    typeof content === "object" &&
    content !== null &&
    typeof content.date === "string" &&
    (content.menuKey === null || typeof content.menuKey === "string") &&
    typeof content.bodyWeight === "string" &&
    typeof content.memo === "string" &&
    typeof content.request === "string" &&
    Array.isArray(content.exercises) &&
    content.exercises.every(
      (exercise) =>
        typeof exercise?.name === "string" &&
        typeof exercise.fixed === "boolean" &&
        typeof exercise.unit === "string" &&
        Array.isArray(exercise.sets) &&
        exercise.sets.every(
          (set) => typeof set?.kg === "string" && typeof set?.reps === "string",
        ),
    )
  );
}

/** 折りたたみの見出しに出す1行(** を外し、改行を詰める)。 */
function plainText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

/**
 * 種目の下に出す、メニューの中身(2026-11-08 から)。
 * 1行目に印と回数・重さの目安を短く出し、ポイント(注意点)は1行だけ見せて、押すと全部開く。
 */
function ExerciseGuide({ item, must }: { item: LogMenuItem; must: boolean }) {
  const dose = plainText(item.dose);
  const target = item.weighted && item.targetKg ? `目安 ${item.targetKg}kg` : "";
  const marked = must && !item.personal;
  return (
    <>
      {marked || item.swapped || item.personal || dose || target ? (
        <p className="tp-log-meta">
          {marked ? <span className="tp-must">★ 欠かさない</span> : null}
          {item.swapped ? <span className="tp-swap">C枠</span> : null}
          {item.personal ? <span className="tp-swap">個人</span> : null}
          {dose ? <span className="tp-log-dose">{dose}</span> : null}
          {target ? <span className="tp-log-dose">{target}</span> : null}
        </p>
      ) : null}
      {item.tip ? (
        <details className="tp-log-fold">
          <summary>
            <span className="tp-log-fold-label">ポイント</span>
            <span className="tp-log-fold-peek">{plainText(item.tip)}</span>
          </summary>
          <p className="tp-log-fold-body">
            <RichText text={item.tip} />
          </p>
        </details>
      ) : null}
    </>
  );
}

/**
 * トレ録を書く画面(日付ごと。2026-11-08 にメニューのページから分けた)。
 * ジムでやりながら記録する。保存ボタンは画面に固定せず、入力欄の最後に置く(iOS 26 では、キーボードを閉じたあと
 * 画面に固定したものがずれて、保存バーが画面の真ん中に浮いたため)。保存していない入力は端末に下書きとして残し、
 * 次に開いたときにすぐ続きから書ける。
 * その日の種目の回数・重さの目安・ポイント・★ は、この画面だけで見られるようにする(メニューのページへ行かずに済むよう)。
 * 情報が多くなりすぎないよう、ふだん使わないもの(メニューの選び直し・ポイントの全文・担当への一言)は折りたたむ。
 */
export function TrainingLogEditor({
  teamSlug,
  memberId,
  today,
  initialDate,
  sessions,
  menuOptions,
  menuKeyByDate,
  videoLinks,
  mustItems,
  trainingHref,
}: TrainingLogEditorProps) {
  const router = useRouter();
  const must = new Set(mustItems);
  const storageKey = (date: string) => draftKey("training", teamSlug, memberId, date);

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

  const [initial] = useState(() => {
    const draft = draftFor(initialDate);
    return { draft, baseline: serialize(draft) };
  });
  const [draft, setDraft] = useState<Draft>(initial.draft);
  // 何も変えていないときの形。これと違えば、端末に下書きを残す。
  const [baseline, setBaseline] = useState(initial.baseline);
  // 下書きを作ったときの、サーバーの記録の写し(戻すときに、ほかの端末で変わっていないか比べる)。
  const [base, setBase] = useState(() => draftBase(sessionOn(initialDate) ?? null));
  // 端末の下書きから戻したとき、その下書きを最後に書いた時刻。
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  // 「トレーニング担当へ」は、書いてあるときだけ初めから開いておく(打っている途中で閉じないよう、開いたときに決める)。
  const [requestOpen, setRequestOpen] = useState(Boolean(initial.draft.request));
  // 端末の下書きを確かめ終わるまでは書かない(開いた直後の形で、残っている下書きを上書きしないように)。
  const [ready, setReady] = useState(false);
  const lastWritten = useRef("");
  const leaving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 「捨てる」を1回押した場所(もう一度押すと捨てる)。戻した知らせの中と保存の欄の2か所にあり、押した方だけ切り替える。
  const [confirmDiscard, setConfirmDiscard] = useState<"notice" | "savearea" | null>(null);

  const dirty = serialize(draft) !== baseline;

  /** その日付を、保存した記録(なければメニュー)から始める。 */
  function startFresh(date: string) {
    const fresh = draftFor(date);
    lastWritten.current = "";
    setDraft(fresh);
    setBaseline(serialize(fresh));
    setBase(draftBase(sessionOn(date) ?? null));
    setRestoredAt(null);
    setStale(false);
    setRequestOpen(Boolean(fresh.request));
  }

  /** その日付の欄を開く。端末に下書きがあれば、それで続きから。 */
  function loadDate(date: string) {
    const storage = browserDraftStorage();
    const stored = storage
      ? readDraft(storage, storageKey(date), isStoredContent)
      : null;
    if (stored && stored.data.date === date) {
      const restored = fromContent(stored.data);
      lastWritten.current = serialize(restored);
      setDraft(restored);
      setBaseline(serialize(draftFor(date)));
      setBase(stored.base);
      setRestoredAt(stored.savedAt);
      setStale(stored.base !== draftBase(sessionOn(date) ?? null));
      setRequestOpen(Boolean(restored.request));
    } else {
      startFresh(date);
    }
    setError("");
    setConfirmDelete(false);
    setConfirmDiscard(null);
  }

  // 開いたときに一度だけ:端末に下書きがあれば、すぐ続きから。
  useEffect(() => {
    const storage = browserDraftStorage();
    if (storage && readDraft(storage, storageKey(initialDate), isStoredContent)) {
      loadDate(initialDate);
    }
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 開いたときに一度だけ

  // 何か変えたら、端末に下書きを書く。開いたときと同じ形に戻したら消す。
  useEffect(() => {
    if (!ready || leaving.current) {
      return;
    }
    const storage = browserDraftStorage();
    if (!storage) {
      return;
    }
    const key = storageKey(draft.date);
    const content = serialize(draft);
    if (content === baseline) {
      removeDraft(storage, key);
      lastWritten.current = "";
      return;
    }
    if (content === lastWritten.current) {
      return;
    }
    const ok = writeDraft(storage, key, {
      savedAt: new Date().toISOString(),
      base,
      data: contentOf(draft),
    });
    lastWritten.current = ok ? content : "";
    setStorageFailed(!ok);
  }, [draft, baseline, base, ready]); // eslint-disable-line react-hooks/exhaustive-deps -- storageKey は人とチームで決まる

  /** 日付を変える。打ちかけの日の下書きは端末に残り、その日に戻せば続きが出る。 */
  function changeDate(date: string) {
    loadDate(date);
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
    setConfirmDiscard(null);
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
    leaving.current = true;
    const url = new URL(trainingHref, window.location.origin);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    // 履歴は置き換える。ブラウザの「戻る」で、保存する前の中身のままの記録画面に戻らないように
    // (そのまま保存すると、古い値で上書きしてしまうため)。
    router.replace(`${url.pathname}${url.search}#log`);
  }

  function forgetDraft(date: string) {
    const storage = browserDraftStorage();
    if (storage) {
      removeDraft(storage, storageKey(date));
    }
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
      // 下書きは、サーバーが受け付けてから消す(失敗したら残る)。
      forgetDraft(draft.date);
      leave({ saved: draft.date });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message}(入力はこの端末に残っています)`
          : "保存できませんでした。",
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
      forgetDraft(draft.date);
      leave({ deleted: draft.date });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "消せませんでした。");
      setBusy(false);
    }
  }

  /**
   * 保存していない入力を捨てる。2回押し(1回目で「もう一度押すと捨てます」に変わる。うっかり押して消えないように)。
   * 捨てたら、保存した記録(なければメニュー)から書き直す。画面を出るのは上の「戻る」(入力は端末に残る)。
   */
  function discard(place: "notice" | "savearea") {
    if (confirmDiscard !== place) {
      setConfirmDiscard(place);
      return;
    }
    forgetDraft(draft.date);
    startFresh(draft.date);
    setConfirmDiscard(null);
  }

  const option = optionOf(draft.menuKey);
  const existing = sessionOn(draft.date);
  // 「この週のメニューをすべて見る」:メニューのページを、その週で開く(キーは「期間/週/曜日」)。
  const [programKey, weekKey] = option?.key.split("/") ?? [];
  const menuPageHref = option
    ? `${trainingHref}${trainingHref.includes("?") ? "&" : "?"}menu=${programKey}&week=${weekKey}`
    : trainingHref;
  /** 種目の下に出す、メニューの中身(メニューにない種目には出さない)。 */
  const guideFor = (name: string) => {
    const item = option?.items.find((entry) => entry.name === name);
    return item ? <ExerciseGuide item={item} must={must.has(item.name)} /> : null;
  };

  return (
    // 保存・削除の通信中は、欄を触れなくする(その間に打った分は送られず、保存できると下書きごと消えるため)。
    <form className="tp-log-editor" onSubmit={save} inert={busy}>
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
              min={addDays(today, -LOG_MAX_PAST_DAYS)}
              max={addDays(today, 1)}
              onChange={(event) => {
                const date = event.target.value;
                // 選べるのは1年前から明日まで(API と同じ)。範囲の外を打っても欄は変えない。
                if (isEditableLogDate(date, today)) {
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

      {restoredAt ? (
        <div className="tp-draftnote" role="status">
          <p>
            保存していない入力を戻しました
            {formatDraftTime(restoredAt)
              ? `(${formatDraftTime(restoredAt)} まで)`
              : ""}
            。
          </p>
          {stale ? (
            <p>
              この日の記録は、そのあとにほかの端末などで保存されています。このまま保存すると、この入力で置き換わります。
            </p>
          ) : null}
          <button
            type="button"
            className={`tp-clear${confirmDiscard === "notice" ? " tp-clear-danger" : ""}`}
            onClick={() => discard("notice")}
          >
            {confirmDiscard === "notice"
              ? "もう一度押すと捨てます"
              : existing
                ? "捨てて、保存した記録に戻す"
                : "捨てて、初めから"}
          </button>
        </div>
      ) : null}
      {storageFailed ? (
        <p className="tp-error" role="alert">
          この端末には下書きを残せません。保存するまで画面を閉じないでください。
        </p>
      ) : null}

      {menuOptions.length > 0 ? (
        // 日付からメニューを選んであるので、ふだんは閉じておく(2026-11-08 から)。
        <details className="tp-log-menu">
          <summary>
            <span className="tp-label">メニュー</span>
            <span className="tp-log-menu-now">
              <b>{option ? option.dayLabel : "メニューなし"}</b>
              <span className="tp-small tp-muted">
                {option ? option.weekLabel : "先週の同じ曜日の記録から"}
              </span>
            </span>
          </summary>
          <div className="tp-log-menu-body">
            <div className="tp-field">
              <label htmlFor="log-menu-week">何週目か</label>
              <select
                id="log-menu-week"
                value={option?.weekKey ?? ""}
                onChange={(event) => {
                  const nextWeekKey = event.target.value;
                  if (!nextWeekKey) {
                    chooseMenu(null);
                    return;
                  }
                  // 週を変えたら、同じ曜日(なければその週の最初の日)を選ぶ。
                  const day = option?.day;
                  const inWeek = menuOptions.filter(
                    (entry) => entry.weekKey === nextWeekKey,
                  );
                  chooseMenu(
                    (inWeek.find((entry) => entry.day === day) ?? inWeek[0])
                      .key,
                  );
                }}
              >
                <option value="">メニューなし(先週の同じ曜日の記録から)</option>
                {menuOptions
                  .filter(
                    (entry, index) =>
                      menuOptions.findIndex(
                        (other) => other.weekKey === entry.weekKey,
                      ) === index,
                  )
                  .map((entry) => (
                    <option key={entry.weekKey} value={entry.weekKey}>
                      {entry.weekLabel}
                    </option>
                  ))}
              </select>
            </div>
            {option ? (
              <div className="tp-log-menu-days" role="group" aria-label="曜日">
                {menuOptions
                  .filter((entry) => entry.weekKey === option.weekKey)
                  .map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      aria-pressed={entry.key === draft.menuKey}
                      onClick={() => chooseMenu(entry.key)}
                    >
                      {entry.dayLabel}
                    </button>
                  ))}
              </div>
            ) : null}
            <Link className="tp-more" href={menuPageHref}>
              この週のメニューをすべて見る →
            </Link>
          </div>
        </details>
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
              消す
            </button>
          </div>
          {guideFor(exercise.name)}
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

      {option?.extras?.length ? (
        // ポジション別の追加・タバタなど。種目の欄はないので、1行だけ見せて、押すと全部開く。
        <details className="tp-log-fold tp-log-extras">
          <summary>
            <span className="tp-log-fold-label">その日の追加</span>
            <span className="tp-log-fold-peek">
              {option.extras.map(plainText).join(" / ")}
            </span>
          </summary>
          <div className="tp-log-fold-body">
            {option.extras.map((extra) => (
              <p key={extra} className="tp-extra">
                <RichText text={extra} />
              </p>
            ))}
          </div>
        </details>
      ) : null}

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
      {/* 毎回は書かないので、ふだんは閉じておく(書いてあれば開いておく)。 */}
      <details
        key={draft.date}
        className="tp-log-fold tp-log-request"
        open={requestOpen}
      >
        <summary>
          <span className="tp-log-fold-label">トレーニング担当へ</span>
          <span className="tp-log-fold-peek">
            {draft.request ? plainText(draft.request) : "反応してほしいこと(なければ空のまま)"}
          </span>
        </summary>
        <div className="tp-field tp-log-fold-body">
          <label htmlFor="log-request" className="tp-sr">
            トレーニング担当へ(反応してほしいこと。なければ空のまま)
          </label>
          <textarea
            id="log-request"
            rows={2}
            // 開いたあとも、見出しの横の文言を入力欄に残す(開くと見出しの横の文言は隠れるため)。
            placeholder="反応してほしいこと(なければ空のまま)"
            value={draft.request}
            onChange={(event) =>
              update((current) => ({ ...current, request: event.target.value }))
            }
          />
        </div>
      </details>

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* 保存は、入力欄の最後(画面には固定しない。2026-11-08 から)。 */}
      {/*
        押すのは「保存」だけ。「やめる」は置かない(上の「戻る」と同じく画面を出るだけで、紛らわしかったため)。
        捨てたいときは、保存していない変更があるときだけ出る「入力を捨てる」から。
      */}
      <div className="tp-savearea">
        {dirty ? (
          <p className="tp-savearea-state">
            まだ保存していません(入力はこの端末に残っています)
            <button
              type="button"
              className={`tp-clear${confirmDiscard === "savearea" ? " tp-clear-danger" : ""}`}
              disabled={busy}
              onClick={() => discard("savearea")}
            >
              {confirmDiscard === "savearea" ? "もう一度押すと捨てます" : "入力を捨てる"}
            </button>
          </p>
        ) : null}
        <button className="tp-button" type="submit" disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
        <p className="tp-small tp-muted">
          重さも回数も空のセットは、保存しません。書いたことは部の全員に見えます。
        </p>
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
