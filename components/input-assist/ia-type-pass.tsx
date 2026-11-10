"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IaPlayer, type IaPlayerHandle } from "@/components/input-assist/ia-player";
import { formatClock, isTypingTarget } from "@/components/input-assist/ia-utils";
import { nextUndecided } from "@/lib/domain/input-assist/effect";
import { courtSideOf, getCountedRallies, type IaSetResult } from "@/lib/domain/input-assist/engine";
import { SKILL_LABELS, sideOfCode, syncServePlay } from "@/lib/domain/input-assist/flow";
import { getRallyWindow } from "@/lib/domain/input-assist/session";
import {
  TYPE_FIELDS_BY_SKILL,
  applyTypesAndZones,
  buildTypeQueue,
  fieldsToReview,
  isClearedType,
  isTypeDecided,
  isUnsureField,
  readTypeValue,
  setPlayType,
  typeFieldLabel,
  typeRallies,
  typeValueLabel,
  type IaTypeProgress,
  type TouchTypeSuggestions,
  type TypeHistory,
  type TypeQueueItem,
  type TypeQueueMode,
} from "@/lib/domain/input-assist/type";
import type { IaPlay, IaRally, IaSet, IaTeamCode, IaTypeField, InputAssistSession } from "@/lib/domain/input-assist/types";

// P4 種類:サーブ・トス・アタックの種類、コール・コンビ、打ち方、ブロックの人数を入れる。
// 前後のタッチから写せる欄・95% 以上の欄は自動で入れ(薄く表示。編集できる)、迷う欄だけを順に動画で見て決める。

const RATES = [1, 0.75, 0.5];
/** タッチの何秒前から流すか・次のタッチの何秒後まで流すか。 */
const LEAD_SECONDS = 1.5;
const TAIL_SECONDS = 1.5;
/** 最後のタッチは、この秒数まで流す(次のラリーの前で止める)。 */
const LAST_TOUCH_SECONDS = 4;
/** ボタンに出す候補の数(1〜9 のキー)。残りは「ほか」から選ぶ。 */
const BUTTON_COUNT = 9;
const NO_FIELDS: IaTypeField[] = [];

type IaTypePassProps = {
  session: InputAssistSession;
  set: IaSet;
  setResult: IaSetResult;
  history: TypeHistory;
  progress: IaTypeProgress[];
  passSeconds: string;
  onSelectSet: (setIndex: number) => void;
  onChangeRally: (rallyId: string, change: (rally: IaRally) => IaRally) => void;
  onActivity: () => void;
};

/** 決めたあとに進む先(次の欄か、次のタッチ)。保存して並びが変わってから決める。 */
type PendingAdvance = { item: TypeQueueItem; field: IaTypeField };

function percent(probability: number): string {
  if (probability <= 0) {
    return "–";
  }
  return probability < 0.01 ? "<1%" : `${Math.round(probability * 100)}%`;
}

/** 値の見せ方("" は「なし」)。 */
function shortValue(value: string | undefined): string {
  if (value === undefined) {
    return "?";
  }
  return value === "" ? "なし" : value;
}

/** 欄の見せ方:決まった値(自動は薄く)、迷う欄は「?」。 */
function fieldState(play: IaPlay, suggestions: TouchTypeSuggestions, field: IaTypeField): "auto" | "manual" | "unsure" | "open" {
  if (isTypeDecided(play, field)) {
    return play.typeSource?.[field] === "auto" ? "auto" : "manual";
  }
  return isUnsureField(play, suggestions[field], field) ? "unsure" : "open";
}

export function IaTypePass({
  session,
  set,
  setResult,
  history,
  progress,
  passSeconds,
  onSelectSet,
  onChangeRally,
  onActivity,
}: IaTypePassProps) {
  const entries = useMemo(() => typeRallies(set, { history }), [set, history]);
  const countedRallies = useMemo(() => getCountedRallies(set), [set]);
  const [mode, setMode] = useState<TypeQueueMode>("unsure");
  const queue = useMemo(() => buildTypeQueue(entries, mode), [entries, mode]);
  const allTouches = useMemo(() => buildTypeQueue(entries, "all"), [entries]);
  const unsureCount = useMemo(() => buildTypeQueue(entries, "unsure").length, [entries]);

  const playById = useMemo(() => {
    const map = new Map<string, { play: IaPlay; index: number; entry: (typeof entries)[number] }>();
    for (const entry of entries) {
      entry.plays.forEach((play, index) => map.set(play.id, { play, index, entry }));
    }
    return map;
  }, [entries]);

  /** タッチの、人が決める欄がみな決まったか。 */
  const isTouchDone = useCallback(
    (item: TypeQueueItem, reviewMode: TypeQueueMode = mode) => {
      const found = playById.get(item.playId);
      if (!found) {
        return true;
      }
      return fieldsToReview(found.play, found.entry.suggestions[found.index], reviewMode).every((field) =>
        isTypeDecided(found.play, field),
      );
    },
    [mode, playById],
  );

  /** タッチで最初に見る欄:迷っていて決まっていない欄 → 迷う欄 → 先頭の欄。 */
  const firstField = useCallback(
    (playId: string): IaTypeField | null => {
      const found = playById.get(playId);
      if (!found) {
        return null;
      }
      const suggestions = found.entry.suggestions[found.index];
      const unsure = fieldsToReview(found.play, suggestions, "unsure");
      return (
        unsure.find((field) => !isTypeDecided(found.play, field)) ?? unsure[0] ?? TYPE_FIELDS_BY_SKILL[found.play.skill][0]
      );
    },
    [playById],
  );

  const [current, setCurrent] = useState<TypeQueueItem | null>(() =>
    nextUndecided(buildTypeQueue(entries, "unsure"), (item) => {
      const found = entries.find((entry) => entry.rally.id === item.rallyId);
      const index = found?.plays.findIndex((play) => play.id === item.playId) ?? -1;
      if (!found || index === -1) {
        return true;
      }
      return fieldsToReview(found.plays[index], found.suggestions[index], "unsure").every((field) =>
        isTypeDecided(found.plays[index], field),
      );
    }, null),
  );
  const [field, setField] = useState<IaTypeField | null>(() => (current ? firstField(current.playId) : null));
  const [pending, setPending] = useState<PendingAdvance | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [message, setMessage] = useState("");

  const playerRef = useRef<IaPlayerHandle | null>(null);
  const windowRef = useRef<{ start: number; end: number; entered: boolean; startedAt: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const found = current ? playById.get(current.playId) : undefined;
  const currentEntry = found?.entry;
  const currentPlay = found?.play;
  const currentSuggestions = found ? found.entry.suggestions[found.index] : undefined;
  const currentFields = currentPlay ? TYPE_FIELDS_BY_SKILL[currentPlay.skill] : NO_FIELDS;
  const activeField = field && currentFields.includes(field) ? field : (currentFields[0] ?? null);
  const suggestion = activeField && currentSuggestions ? currentSuggestions[activeField] : undefined;
  const result = currentEntry ? setResult.byRallyId.get(currentEntry.rally.id) : undefined;
  const setProgress = progress.find((entry) => entry.setIndex === set.setIndex);

  const teamName = useCallback((team: IaTeamCode) => session.teams[sideOfCode(team)].name, [session.teams]);
  const teamClass = useCallback((team: IaTeamCode) => `ia-team-${courtSideOf(set, sideOfCode(team))}`, [set]);

  // ---- 動画 ----

  const playTouch = useCallback(
    (item: TypeQueueItem, nextField?: IaTypeField | null) => {
      setCurrent(item);
      setField(nextField === undefined ? firstField(item.playId) : nextField);
      const target = playById.get(item.playId);
      if (!target) {
        return;
      }
      const { entry, index, play } = target;
      const time = play.time ?? entry.rally.serveTime;
      const next = entry.plays[index + 1];
      let end: number;
      if (next && typeof next.time === "number") {
        end = next.time + TAIL_SECONDS;
      } else {
        const range = getRallyWindow(countedRallies, entry.rally.id);
        end = Math.min(range?.end ?? time + LAST_TOUCH_SECONDS, time + LAST_TOUCH_SECONDS);
      }
      const start = Math.max(0, time - LEAD_SECONDS);
      windowRef.current = { start, end: Math.max(end, time + 1), entered: false, startedAt: Date.now() };
      playerRef.current?.playFrom(start);
    },
    [countedRallies, firstField, playById],
  );

  const handleTime = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds);
      const range = windowRef.current;
      if (!range) {
        return;
      }
      onActivity();
      if (!range.entered) {
        if (seconds >= range.start - 0.5 && seconds < range.end) {
          range.entered = true;
        } else if (Date.now() - range.startedAt > 4000) {
          windowRef.current = null;
        }
        return;
      }
      if (seconds < range.start - 1.5) {
        windowRef.current = null;
        return;
      }
      if (seconds >= range.end) {
        windowRef.current = null;
        playerRef.current?.pause();
      }
    },
    [onActivity],
  );

  const changeRate = useCallback((next: number) => {
    setRate(next);
    playerRef.current?.setRate(next);
  }, []);

  useEffect(() => {
    if (current) {
      rowRefs.current.get(current.rallyId)?.scrollIntoView({ block: "nearest" });
    }
  }, [current]);

  // ---- 欄を決める ----

  const saveType = useCallback(
    (item: TypeQueueItem, targetField: IaTypeField, value: string | null) => {
      const rallyResult = setResult.byRallyId.get(item.rallyId);
      if (!rallyResult) {
        return;
      }
      onChangeRally(item.rallyId, (rally) => {
        const synced = syncServePlay(rally, rallyResult.servingTeam, rallyResult.server);
        const edited = synced.map((play) => (play.id === item.playId ? setPlayType(play, targetField, value) : play));
        // 写せる欄・コンビから分かるアタックの始まり(P3)も入れ直す
        return { ...rally, plays: applyTypesAndZones(edited, { history, lineup: rallyResult.lineup }) };
      });
    },
    [history, onChangeRally, setResult.byRallyId],
  );

  /** 並びの中で前後に動く。今のタッチが並びにないときは、ラリーの順で次(前)にある並びのタッチへ。 */
  const neighbor = useCallback(
    (from: TypeQueueItem | null, delta: number): TypeQueueItem | null => {
      if (queue.length === 0) {
        return null;
      }
      if (!from) {
        return delta > 0 ? queue[0] : (queue.at(-1) ?? null);
      }
      const index = queue.findIndex((item) => item.playId === from.playId);
      if (index !== -1) {
        return queue[index + delta] ?? null;
      }
      const order = new Map(allTouches.map((item, position) => [item.playId, position]));
      const position = order.get(from.playId) ?? -1;
      const candidates = delta > 0 ? queue : [...queue].reverse();
      return (
        candidates.find((item) => {
          const other = order.get(item.playId) ?? -1;
          return delta > 0 ? other > position : other < position;
        }) ?? null
      );
    },
    [allTouches, queue],
  );

  // 決めたあと:保存して自動の欄が入り直してから、同じタッチの次の欄か、次のタッチへ進む
  useEffect(() => {
    if (!pending) {
      return;
    }
    setPending(null);
    const target = playById.get(pending.item.playId);
    if (target) {
      const suggestions = target.entry.suggestions[target.index];
      const fields = TYPE_FIELDS_BY_SKILL[target.play.skill];
      const nextField =
        mode === "all"
          ? fields[fields.indexOf(pending.field) + 1]
          : fieldsToReview(target.play, suggestions, "unsure").find(
              (candidate) => candidate !== pending.field && !isTypeDecided(target.play, candidate),
            );
      if (nextField) {
        setField(nextField);
        return;
      }
    }
    const next =
      mode === "unsure"
        ? nextUndecided(queue, (item) => item.playId === pending.item.playId || isTouchDone(item), pending.item)
        : neighbor(pending.item, 1);
    if (!next) {
      windowRef.current = null;
      playerRef.current?.pause();
      setMessage(mode === "unsure" ? "このセットの迷う欄は、全部決まりました。" : "このセットの最後のタッチです。");
      return;
    }
    setMessage("");
    playTouch(next);
  }, [isTouchDone, mode, neighbor, pending, playById, playTouch, queue]);

  const choose = useCallback(
    (value: string) => {
      if (!current || !activeField) {
        return;
      }
      saveType(current, activeField, value);
      setPending({ item: current, field: activeField });
    },
    [activeField, current, saveType],
  );

  const move = useCallback(
    (delta: number) => {
      const next = neighbor(current, delta);
      if (!next) {
        setMessage(delta > 0 ? "並びの最後のタッチです。" : "並びの最初のタッチです。");
        return;
      }
      setMessage("");
      playTouch(next);
    },
    [current, neighbor, playTouch],
  );

  const clear = useCallback(() => {
    if (current && activeField) {
      saveType(current, activeField, null);
    }
  }, [activeField, current, saveType]);

  const acceptTop = useCallback(() => {
    if (!current || !currentPlay || !activeField) {
      move(1);
      return;
    }
    const value = readTypeValue(currentPlay, activeField) ?? suggestion?.top;
    if (value !== undefined) {
      choose(value);
    }
  }, [activeField, choose, current, currentPlay, move, suggestion?.top]);

  const cycleField = useCallback(
    (delta: number) => {
      if (currentFields.length === 0 || !activeField) {
        return;
      }
      const index = currentFields.indexOf(activeField);
      setField(currentFields[(index + delta + currentFields.length) % currentFields.length]);
    },
    [activeField, currentFields],
  );

  const replay = useCallback(() => {
    if (current) {
      playTouch(current, activeField);
    } else {
      move(1);
    }
  }, [activeField, current, move, playTouch]);

  const buttonCandidates = useMemo(() => (suggestion ? suggestion.candidates.slice(0, BUTTON_COUNT) : []), [suggestion]);
  const otherCandidates = useMemo(() => (suggestion ? suggestion.candidates.slice(BUTTON_COUNT) : []), [suggestion]);

  // ---- キー ----

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const key = event.key;
      let handled = true;
      if (/^[1-9]$/.test(key)) {
        const candidate = buttonCandidates[Number(key) - 1];
        if (candidate) {
          choose(candidate.value);
        }
      } else if (key === "Tab") {
        cycleField(event.shiftKey ? -1 : 1);
      } else if (key === "Enter") {
        acceptTop();
      } else if (key === "Backspace") {
        clear();
      } else if (key === " ") {
        replay();
      } else if (key === "ArrowLeft") {
        move(-1);
      } else if (key === "ArrowRight") {
        move(1);
      } else {
        handled = false;
      }
      if (handled) {
        event.preventDefault();
        onActivity();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [acceptTop, buttonCandidates, choose, clear, cycleField, move, onActivity, replay]);

  // ---- 画面 ----

  const queueIndex = current ? queue.findIndex((item) => item.playId === current.playId) : -1;
  const currentValue = currentPlay && activeField ? readTypeValue(currentPlay, activeField) : undefined;
  const source = currentPlay && activeField ? currentPlay.typeSource?.[activeField] : undefined;

  return (
    <div className="ia-p0 ia-p2 ia-p4">
      <section className="panel ia-video-panel">
        <div className="panel-inner stack">
          <IaPlayer ref={playerRef} youtubeUrl={set.youtubeUrl} onTime={handleTime} />
          <div className="ia-now">
            <span className="mono">{formatClock(currentTime)}</span>
            <span className="ia-rates" role="group" aria-label="再生の速さ">
              {RATES.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`ia-rate ${rate === value ? "ia-rate-active" : ""}`}
                  onClick={() => changeRate(value)}
                >
                  {value}倍
                </button>
              ))}
            </span>
            <span className="ia-rates" role="group" aria-label="見るタッチ">
              <button
                type="button"
                className={`ia-rate ${mode === "unsure" ? "ia-rate-active" : ""}`}
                onClick={() => setMode("unsure")}
              >
                迷うものだけ({unsureCount})
              </button>
              <button
                type="button"
                className={`ia-rate ${mode === "all" ? "ia-rate-active" : ""}`}
                onClick={() => setMode("all")}
              >
                全部({allTouches.length})
              </button>
            </span>
            <span className="muted">P4 の時間:{passSeconds}</span>
          </div>

          {currentEntry && currentPlay && currentSuggestions && activeField && suggestion ? (
            <>
              <div className="ia-flow-head">
                <strong>
                  {currentEntry.number}本目 {formatClock(currentEntry.rally.serveTime)}
                </strong>
                {result ? (
                  <span className="muted">
                    {result.scoreBefore.home}-{result.scoreBefore.away} → 点:{session.teams[result.pointWinner].name}
                    {result.pointGuessed ? "?" : ""}
                  </span>
                ) : null}
                <span className="muted">{queueIndex === -1 ? "並びの外" : `${queueIndex + 1} / ${queue.length}`}</span>
              </div>

              <div className={`ia-next ${teamClass(currentPlay.team)}`}>
                <div className="ia-next-main">
                  <strong className="ia-next-team">{teamName(currentPlay.team)}</strong>
                  <strong className="ia-next-skill">
                    {currentPlay.player}番 {currentPlay.skill} {SKILL_LABELS[currentPlay.skill]}
                    {currentPlay.effect ? ` ${currentPlay.effect}` : ""}
                  </strong>
                </div>
                <div className="ia-type-fields" role="tablist" aria-label="欄">
                  {currentFields.map((candidate) => {
                    const state = fieldState(currentPlay, currentSuggestions, candidate);
                    const value = readTypeValue(currentPlay, candidate);
                    return (
                      <button
                        type="button"
                        role="tab"
                        key={candidate}
                        aria-selected={candidate === activeField}
                        className={`ia-type-field ia-type-field-${state} ${candidate === activeField ? "ia-type-field-active" : ""}`}
                        onClick={() => setField(candidate)}
                      >
                        <span>{typeFieldLabel(currentPlay.skill, candidate)}</span>
                        <strong className="mono">{shortValue(value)}</strong>
                      </button>
                    );
                  })}
                </div>
                <p className="muted ia-note">
                  {suggestion.basis}
                  {suggestion.sample > 0 ? `(${suggestion.sample})` : ""}
                  {source === "auto" ? "。自動で入れました(編集できます)" : ""}
                  {isClearedType(currentPlay, activeField) ? "。消しました(自動では入れません)" : ""}
                  {currentValue !== undefined && source === undefined ? "。読み込んだ値" : ""}
                </p>
                <div className="ia-type-options">
                  {buttonCandidates.map((candidate, index) => {
                    const classes = [
                      "ia-effect",
                      "ia-type-option",
                      candidate.value === suggestion.top ? "ia-effect-top" : "",
                      candidate.value === currentValue ? "ia-effect-active" : "",
                    ].join(" ");
                    return (
                      <button type="button" key={candidate.value || "none"} className={classes} onClick={() => choose(candidate.value)}>
                        <kbd>{index + 1}</kbd>
                        <strong className="mono">{shortValue(candidate.value)}</strong>
                        <span>{typeValueLabel(currentPlay.skill, activeField, candidate.value)}</span>
                        <span className="ia-effect-bar" aria-hidden="true">
                          <span style={{ width: `${Math.round(candidate.probability * 100)}%` }} />
                        </span>
                        <span className="muted mono">{percent(candidate.probability)}</span>
                      </button>
                    );
                  })}
                </div>
                {otherCandidates.length > 0 ? (
                  <label className="ia-type-other">
                    <span className="muted">ほか</span>
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          choose(event.target.value.slice(1));
                        }
                        event.target.blur();
                      }}
                    >
                      <option value="">選ぶ</option>
                      {otherCandidates.map((candidate) => (
                        <option key={candidate.value || "none"} value={`=${candidate.value}`}>
                          {shortValue(candidate.value)} {typeValueLabel(currentPlay.skill, activeField, candidate.value)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <ol className="ia-plays">
                {currentEntry.plays.map((play, index) => (
                  <li key={play.id} className={play.id === currentPlay.id ? "ia-play-active" : ""}>
                    <button
                      type="button"
                      className={`ia-play ia-play-type ${teamClass(play.team)}`}
                      onClick={() => playTouch({ rallyId: currentEntry.rally.id, playId: play.id })}
                    >
                      <span className="ia-rally-no">{index + 1}</span>
                      <span className="ia-play-team">{teamName(play.team)}</span>
                      <strong className="mono">{play.player}</strong>
                      <span>
                        {play.skill} {SKILL_LABELS[play.skill]}
                      </span>
                      <span className="ia-type-badges">
                        {TYPE_FIELDS_BY_SKILL[play.skill].map((candidate) => (
                          <span
                            key={candidate}
                            className={`ia-type-badge mono ia-type-badge-${fieldState(play, currentEntry.suggestions[index], candidate)}`}
                            title={typeFieldLabel(play.skill, candidate)}
                          >
                            {shortValue(readTypeValue(play, candidate))}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="muted ia-note">
              {entries.length === 0
                ? "このセットには、P1 を入れ終えたラリーがありません。先に P1 でタッチを入れてください。"
                : queue.length === 0
                  ? "迷う欄はありません(全部自動で入りました)。「全部」で見直せます。"
                  : "右の一覧からタッチを選ぶか、→ で始めます。"}
            </p>
          )}

          {message ? (
            <p className="ia-message" role="status">
              {message}
            </p>
          ) : null}

          <details className="ia-subs" open>
            <summary>キー</summary>
            <ul className="ia-key-help">
              <li>
                <kbd>1</kbd>〜<kbd>9</kbd> 候補で決めて、次の欄(なければ次のタッチ)へ
              </li>
              <li>
                <kbd>Tab</kbd> 欄を切り替える / <kbd>Enter</kbd> 今の値(なければ一番の候補)で決める /{" "}
                <kbd>Backspace</kbd> 欄を消す(自動でも入れ直さない)
              </li>
              <li>
                <kbd>Space</kbd> もう一度流す / <kbd>←</kbd>
                <kbd>→</kbd> 前・次のタッチ
              </li>
              <li>トスのすぐあとのアタックは、トスより先に出ます(コンビが決まると、コールを当てやすい)</li>
            </ul>
          </details>
        </div>
      </section>

      <section className="panel ia-rally-panel">
        <div className="panel-inner stack">
          <div className="ia-flow-progress">
            {progress.map((entry) => (
              <button
                type="button"
                key={entry.setIndex}
                className={`ia-check-card ${entry.setIndex === set.setIndex ? "ia-check-card-active" : ""} ${
                  entry.total > 0 && entry.remaining === 0 ? "ia-check-ok" : ""
                }`}
                onClick={() => onSelectSet(entry.setIndex)}
              >
                <strong>{entry.setIndex}セット目</strong>
                <span>
                  欄 {entry.decided} / {entry.total}
                </span>
                <span>{entry.remaining > 0 ? `迷う残り ${entry.remaining}` : entry.total > 0 ? "迷う残りなし" : ""}</span>
              </button>
            ))}
          </div>
          <div className="ia-rally-head">
            <h3 className="ia-subheading">{set.setIndex}セット目のタッチ</h3>
            <span className="muted">
              {setProgress ? `${setProgress.decided} / ${setProgress.total}・ラリー ${setProgress.rallies} 本` : ""}
            </span>
          </div>
          {entries.length === 0 ? (
            <p className="muted">P1 を入れ終えたラリーがありません。</p>
          ) : (
            <ol className="ia-rally-list">
              {entries.map((entry) => (
                <li
                  key={entry.rally.id}
                  className={`ia-rally ia-effect-rally ${entry.rally.id === current?.rallyId ? "ia-rally-active" : ""}`}
                  ref={(element) => {
                    if (element) {
                      rowRefs.current.set(entry.rally.id, element);
                    } else {
                      rowRefs.current.delete(entry.rally.id);
                    }
                  }}
                >
                  <span className="ia-rally-no">{entry.number}</span>
                  <span className="ia-effect-chips">
                    {entry.plays.map((play, index) => {
                      const suggestions = entry.suggestions[index];
                      const fields = TYPE_FIELDS_BY_SKILL[play.skill];
                      const main = fields[0];
                      const unsure = fields.some((candidate) => fieldState(play, suggestions, candidate) === "unsure");
                      const allAuto = fields.every((candidate) => fieldState(play, suggestions, candidate) === "auto");
                      const classes = [
                        "ia-chip",
                        teamClass(play.team),
                        play.id === current?.playId ? "ia-chip-current" : "",
                        allAuto ? "ia-chip-auto" : "",
                        unsure ? "ia-chip-unsure" : "",
                      ].join(" ");
                      return (
                        <button
                          type="button"
                          key={play.id}
                          className={classes}
                          title={`${teamName(play.team)} ${play.player}番 ${SKILL_LABELS[play.skill]}`}
                          onClick={() => playTouch({ rallyId: entry.rally.id, playId: play.id })}
                        >
                          {play.player}
                          {play.skill}
                          <strong>{shortValue(readTypeValue(play, main))}</strong>
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
