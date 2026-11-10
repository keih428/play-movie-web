"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IaPlayer, type IaPlayerHandle } from "@/components/input-assist/ia-player";
import { formatClock, isTypingTarget } from "@/components/input-assist/ia-utils";
import {
  EFFECT_BY_KEY,
  EFFECT_KEY_OF,
  EFFECT_LABELS,
  IA_EFFECTS,
  applyAutoEffects,
  buildEffectQueue,
  effectHints,
  effectRallies,
  nextUndecided,
  setPlayEffect,
  type EffectQueueItem,
  type EffectQueueMode,
  type IaEffect,
  type IaEffectProgress,
} from "@/lib/domain/input-assist/effect";
import { courtSideOf, getCountedRallies, teamCode, type IaSetResult } from "@/lib/domain/input-assist/engine";
import { SKILL_LABELS, sideOfCode, syncServePlay } from "@/lib/domain/input-assist/flow";
import { getRallyWindow } from "@/lib/domain/input-assist/session";
import type { IaPlay, IaRally, IaSet, IaTeamCode, InputAssistSession } from "@/lib/domain/input-assist/types";

// P2 評価:各タッチの評価(# + ! - / =)だけを入れる。
// 前後のタッチと点でほぼ決まる評価は自動で入れ(薄く表示。編集できる)、迷うタッチだけを順に動画で見て決める。

const RATES = [1, 0.75, 0.5];
/** タッチの何秒前から流すか・次のタッチの何秒後まで流すか。 */
const LEAD_SECONDS = 1.5;
const TAIL_SECONDS = 1.5;
/** 最後のタッチは、この秒数まで流す(次のラリーの前で止める)。 */
const LAST_TOUCH_SECONDS = 4;

type IaEffectPassProps = {
  session: InputAssistSession;
  set: IaSet;
  setResult: IaSetResult;
  progress: IaEffectProgress[];
  passSeconds: string;
  onSelectSet: (setIndex: number) => void;
  onChangeRally: (rallyId: string, change: (rally: IaRally) => IaRally) => void;
  onActivity: () => void;
};

function percent(probability: number): string {
  if (probability <= 0) {
    return "–";
  }
  return probability < 0.01 ? "<1%" : `${Math.round(probability * 100)}%`;
}

export function IaEffectPass({
  session,
  set,
  setResult,
  progress,
  passSeconds,
  onSelectSet,
  onChangeRally,
  onActivity,
}: IaEffectPassProps) {
  const entries = useMemo(() => effectRallies(set), [set]);
  const countedRallies = useMemo(() => getCountedRallies(set), [set]);
  const [mode, setMode] = useState<EffectQueueMode>("unsure");
  const queue = useMemo(() => buildEffectQueue(entries, mode), [entries, mode]);
  const allTouches = useMemo(() => buildEffectQueue(entries, "all"), [entries]);

  const playById = useMemo(() => {
    const map = new Map<string, { play: IaPlay; index: number; entry: (typeof entries)[number] }>();
    for (const entry of entries) {
      entry.plays.forEach((play, index) => map.set(play.id, { play, index, entry }));
    }
    return map;
  }, [entries]);
  const isDecided = useCallback((item: EffectQueueItem) => playById.get(item.playId)?.play.effect !== undefined, [playById]);

  const [current, setCurrent] = useState<EffectQueueItem | null>(
    () => nextUndecided(buildEffectQueue(entries, "unsure"), (item) => playById.get(item.playId)?.play.effect !== undefined, null),
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [message, setMessage] = useState("");

  const playerRef = useRef<IaPlayerHandle | null>(null);
  const windowRef = useRef<{ start: number; end: number; entered: boolean; startedAt: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const found = current ? playById.get(current.playId) : undefined;
  const currentEntry = found?.entry;
  const currentPlay = found?.play;
  const suggestion = found ? found.entry.suggestions[found.index] : undefined;
  const result = currentEntry ? setResult.byRallyId.get(currentEntry.rally.id) : undefined;
  const hints = useMemo(
    () => (currentEntry ? effectHints(currentEntry.plays, currentEntry.pointWinner) : []),
    [currentEntry],
  );
  const setProgress = progress.find((entry) => entry.setIndex === set.setIndex);

  const teamName = useCallback((team: IaTeamCode) => session.teams[sideOfCode(team)].name, [session.teams]);
  const teamClass = useCallback((team: IaTeamCode) => `ia-team-${courtSideOf(set, sideOfCode(team))}`, [set]);

  // ---- 動画 ----

  const playTouch = useCallback(
    (item: EffectQueueItem) => {
      setCurrent(item);
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
    [countedRallies, playById],
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

  // ---- 評価を決める ----

  const saveEffect = useCallback(
    (item: EffectQueueItem, effect: IaEffect | null) => {
      const rallyResult = setResult.byRallyId.get(item.rallyId);
      if (!rallyResult) {
        return;
      }
      const pointWinner = teamCode(rallyResult.pointWinner);
      onChangeRally(item.rallyId, (rally) => {
        const synced = syncServePlay(rally, rallyResult.servingTeam, rallyResult.server);
        const edited = synced.map((play) => (play.id === item.playId ? setPlayEffect(play, effect) : play));
        return { ...rally, plays: applyAutoEffects(edited, pointWinner) };
      });
    },
    [onChangeRally, setResult.byRallyId],
  );

  /** 並びの中で前後に動く。今のタッチが並びにないときは、ラリーの順で次(前)にある並びのタッチへ。 */
  const neighbor = useCallback(
    (from: EffectQueueItem | null, delta: number): EffectQueueItem | null => {
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

  const choose = useCallback(
    (effect: IaEffect) => {
      if (!current) {
        return;
      }
      saveEffect(current, effect);
      const next =
        mode === "unsure"
          ? nextUndecided(queue, (item) => item.playId === current.playId || isDecided(item), current)
          : neighbor(current, 1);
      if (!next) {
        windowRef.current = null;
        playerRef.current?.pause();
        setMessage(mode === "unsure" ? "このセットの迷うタッチは、全部決まりました。" : "このセットの最後のタッチです。");
        return;
      }
      setMessage("");
      playTouch(next);
    },
    [current, isDecided, mode, neighbor, playTouch, queue, saveEffect],
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
    if (current) {
      saveEffect(current, null);
    }
  }, [current, saveEffect]);

  const acceptTop = useCallback(() => {
    if (!current) {
      move(1);
      return;
    }
    const effect = (currentPlay?.effect as IaEffect | undefined) ?? suggestion?.top;
    if (effect) {
      choose(effect);
    }
  }, [choose, current, currentPlay?.effect, move, suggestion?.top]);

  const replay = useCallback(() => {
    if (current) {
      playTouch(current);
    } else {
      move(1);
    }
  }, [current, move, playTouch]);

  // ---- キー ----

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const key = event.key;
      let handled = true;
      if (EFFECT_BY_KEY[key]) {
        choose(EFFECT_BY_KEY[key]);
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
  }, [acceptTop, choose, clear, move, onActivity, replay]);

  // ---- 画面 ----

  const queueIndex = current ? queue.findIndex((item) => item.playId === current.playId) : -1;
  const unsureCount = useMemo(() => buildEffectQueue(entries, "unsure").length, [entries]);

  return (
    <div className="ia-p0 ia-p2">
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
            <span className="muted">P2 の時間:{passSeconds}</span>
          </div>

          {currentEntry && currentPlay && suggestion ? (
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
                <span className="muted">
                  {queueIndex === -1 ? "並びの外" : `${queueIndex + 1} / ${queue.length}`}
                </span>
              </div>

              <div className={`ia-next ${teamClass(currentPlay.team)}`}>
                <div className="ia-next-main">
                  <strong className="ia-next-team">{teamName(currentPlay.team)}</strong>
                  <strong className="ia-next-skill">
                    {currentPlay.player}番 {currentPlay.skill} {SKILL_LABELS[currentPlay.skill]}
                  </strong>
                  <span className="ia-next-buffer mono" aria-live="polite">
                    {currentPlay.effect ?? "?"}
                  </span>
                </div>
                <p className="muted ia-note">
                  {suggestion.fromContext ? `田中のデータ ${suggestion.sample} プレーから` : "前後が珍しいので、スキルだけの割合"}
                  {currentPlay.effectSource === "auto" ? "。自動で入れました(編集できます)" : ""}
                  {currentPlay.effectSource === "cleared" ? "。消しました(自動では入れません)" : ""}
                  {currentPlay.effect !== undefined && currentPlay.effectSource === undefined ? "。読み込んだ評価" : ""}
                </p>
                <div className="ia-effects">
                  {IA_EFFECTS.map((effect) => {
                    const probability = suggestion.candidates.find((candidate) => candidate.effect === effect)?.probability ?? 0;
                    const classes = [
                      "ia-effect",
                      effect === suggestion.top ? "ia-effect-top" : "",
                      effect === currentPlay.effect ? "ia-effect-active" : "",
                    ].join(" ");
                    return (
                      <button type="button" key={effect} className={classes} onClick={() => choose(effect)}>
                        <kbd>{EFFECT_KEY_OF[effect]}</kbd>
                        <strong className="mono">{effect}</strong>
                        <span>{EFFECT_LABELS[currentPlay.skill][effect]}</span>
                        <span className="ia-effect-bar" aria-hidden="true">
                          <span style={{ width: `${Math.round(probability * 100)}%` }} />
                        </span>
                        <span className="muted mono">{percent(probability)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <ol className="ia-plays">
                {currentEntry.plays.map((play, index) => {
                  const unsure = !currentEntry.suggestions[index].isConfident || play.effectSource === "cleared";
                  return (
                    <li key={play.id} className={play.id === currentPlay.id ? "ia-play-active" : ""}>
                      <button
                        type="button"
                        className={`ia-play ia-play-effect ${teamClass(play.team)}`}
                        onClick={() => playTouch({ rallyId: currentEntry.rally.id, playId: play.id })}
                      >
                        <span className="ia-rally-no">{index + 1}</span>
                        <span className="ia-play-team">{teamName(play.team)}</span>
                        <strong className="mono">{play.player}</strong>
                        <span>
                          {play.skill} {SKILL_LABELS[play.skill]}
                        </span>
                        <span className="mono muted">{typeof play.time === "number" ? formatClock(play.time) : ""}</span>
                        <span
                          className={`ia-effect-badge mono ${play.effectSource === "auto" ? "ia-effect-auto" : ""} ${
                            play.effect === undefined && unsure ? "ia-effect-unsure" : ""
                          }`}
                        >
                          {play.effect ?? "?"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {hints.length > 0 ? (
                <ul className="ia-warnings">
                  {hints.map((hint, index) => (
                    <li key={`${hint.playId}-${index}`}>{hint.message}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="muted ia-note">
              {entries.length === 0
                ? "このセットには、P1 を入れ終えたラリーがありません。先に P1 でタッチを入れてください。"
                : queue.length === 0
                  ? "迷うタッチはありません(全部自動で入りました)。「全部」で見直せます。"
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
                <kbd>1</kbd> # / <kbd>2</kbd> + / <kbd>3</kbd> ! / <kbd>4</kbd> - / <kbd>5</kbd> / / <kbd>6</kbd> = で決めて、次のタッチへ(記号のキーでも入ります)
              </li>
              <li>
                <kbd>Enter</kbd> 今の評価(なければ一番の候補)で決める / <kbd>Backspace</kbd> 評価を消す(自動でも入れ直さない)
              </li>
              <li>
                <kbd>Space</kbd> もう一度流す / <kbd>←</kbd>
                <kbd>→</kbd> 前・次のタッチ
              </li>
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
                  entry.total > 0 && entry.decided === entry.total ? "ia-check-ok" : ""
                }`}
                onClick={() => onSelectSet(entry.setIndex)}
              >
                <strong>{entry.setIndex}セット目</strong>
                <span>
                  評価 {entry.decided} / {entry.total}
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
                      const unsure = !entry.suggestions[index].isConfident || play.effectSource === "cleared";
                      const classes = [
                        "ia-chip",
                        teamClass(play.team),
                        play.id === current?.playId ? "ia-chip-current" : "",
                        play.effectSource === "auto" ? "ia-chip-auto" : "",
                        play.effect === undefined && unsure ? "ia-chip-unsure" : "",
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
                          <strong>{play.effect ?? "?"}</strong>
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
