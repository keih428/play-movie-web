"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IaPlayer, type IaPlayerHandle } from "@/components/input-assist/ia-player";
import { formatClock, isTypingTarget } from "@/components/input-assist/ia-utils";
import { courtSideOf, type IaRallyResult, type IaSetResult } from "@/lib/domain/input-assist/engine";
import {
  SKILL_LABELS,
  buildCandidates,
  flowWarnings,
  isFlowEntered,
  isShirtUnambiguous,
  knownShirts,
  otherCode,
  predictNextPlay,
  sideOfCode,
  syncServePlay,
  type IaFlowProgress,
} from "@/lib/domain/input-assist/flow";
import { createObjectId } from "@/lib/domain/input-assist/ids";
import { getRallyWindow, roundTime } from "@/lib/domain/input-assist/session";
import {
  IA_SKILLS,
  type IaPlay,
  type IaRally,
  type IaSet,
  type IaSkill,
  type IaTeamCode,
  type InputAssistSession,
} from "@/lib/domain/input-assist/types";

// P1 流れ:ラリーごとに「誰が・どのスキルで・どの順で触ったか」だけを入れる。
// 次のチームとスキルは流れから予想し、背番号を打つだけで進めるようにする。

const COMMIT_DELAY_MS = 600;
/** 背番号を決めた直後にスキルのキー・Tab を押したら、そのタッチを編集する(それより後は次のタッチ)。 */
const LAST_PLAY_WINDOW_MS = 1200;
const JUMP_SECONDS = 2;
const RATES = [1, 0.75, 0.5];
const SKILL_KEYS: Record<string, IaSkill> = { s: "S", r: "R", e: "E", a: "A", b: "B", d: "D", f: "F" };

type FlowInput = {
  /** 打ちかけの背番号。 */
  buffer: string;
  /** 背番号を打ち始めたときの動画の時刻(タッチの時刻にする)。 */
  bufferTime: number | null;
  /** 次のタッチのスキルを、予想から変えたもの。 */
  skill: IaSkill | null;
  /** 次のタッチのチームを、予想と入れ替えたか。 */
  flipTeam: boolean;
};

const EMPTY_INPUT: FlowInput = { buffer: "", bufferTime: null, skill: null, flipTeam: false };

type IaFlowPassProps = {
  session: InputAssistSession;
  set: IaSet;
  setResult: IaSetResult;
  progress: IaFlowProgress[];
  passSeconds: string;
  onSelectSet: (setIndex: number) => void;
  onChangeRally: (rallyId: string, change: (rally: IaRally) => IaRally) => void;
  onActivity: () => void;
};

export function IaFlowPass({
  session,
  set,
  setResult,
  progress,
  passSeconds,
  onSelectSet,
  onChangeRally,
  onActivity,
}: IaFlowPassProps) {
  // 得点の計算に使うラリー(ラリーで、サーブの向きが決まっているもの)だけを、時刻の順に
  const entries = useMemo(() => {
    const byId = new Map(set.rallies.map((rally) => [rally.id, rally]));
    return setResult.rallies
      .map((result) => ({ rally: byId.get(result.rallyId), result }))
      .filter((entry): entry is { rally: IaRally; result: IaRallyResult } => entry.rally !== undefined);
  }, [set.rallies, setResult.rallies]);
  const countedRallies = useMemo(() => entries.map((entry) => entry.rally), [entries]);

  const [selectedRallyId, setSelectedRallyId] = useState<string | null>(
    () => (entries.find((entry) => !isFlowEntered(entry.rally)) ?? entries[0])?.rally.id ?? null,
  );
  const [input, setInputState] = useState<FlowInput>(EMPTY_INPUT);
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [message, setMessage] = useState("");

  const playerRef = useRef<IaPlayerHandle | null>(null);
  const currentTimeRef = useRef(0);
  const inputRef = useRef(input);
  const timerRef = useRef<number | null>(null);
  const lastCommitRef = useRef<{ playId: string; at: number } | null>(null);
  const windowRef = useRef<{ start: number; end: number; entered: boolean; startedAt: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const setInput = useCallback((next: FlowInput) => {
    inputRef.current = next;
    setInputState(next);
  }, []);

  const current = entries.find((entry) => entry.rally.id === selectedRallyId);
  const currentIndex = current ? entries.indexOf(current) : -1;
  const plays = useMemo(
    () => (current ? syncServePlay(current.rally, current.result.servingTeam, current.result.server) : []),
    [current],
  );
  const prediction = useMemo(() => predictNextPlay(plays), [plays]);
  const nextTeam: IaTeamCode = input.flipTeam ? otherCode(prediction.team) : prediction.team;
  const nextSkill: IaSkill = input.skill ?? prediction.skill;
  const nextSide = sideOfCode(nextTeam);
  const candidates = useMemo(
    () => (current ? buildCandidates(current.result.lineup[nextSide], session.teams[nextSide], nextSkill) : []),
    [current, nextSide, nextSkill, session.teams],
  );
  const shirts = useMemo(
    () => (current ? knownShirts(current.result.lineup[nextSide], session.teams[nextSide]) : []),
    [current, nextSide, session.teams],
  );
  const warnings = useMemo(
    () =>
      current
        ? flowWarnings(plays, { lineup: current.result.lineup, teams: session.teams, pointWinner: current.result.pointWinner })
        : [],
    [current, plays, session.teams],
  );
  const selectedPlay = plays.find((play) => play.id === selectedPlayId);
  const setProgress = progress.find((entry) => entry.setIndex === set.setIndex);

  const teamName = useCallback((team: IaTeamCode) => session.teams[sideOfCode(team)].name, [session.teams]);
  const teamClass = useCallback((team: IaTeamCode) => `ia-team-${courtSideOf(set, sideOfCode(team))}`, [set]);

  // ---- 動画 ----

  const getTime = useCallback(() => playerRef.current?.getTime() ?? currentTimeRef.current, []);

  const playRally = useCallback(
    (rallyId: string) => {
      const range = getRallyWindow(countedRallies, rallyId);
      setSelectedRallyId(rallyId);
      setSelectedPlayId(null);
      setInput(EMPTY_INPUT);
      lastCommitRef.current = null;
      if (!range) {
        return;
      }
      windowRef.current = { ...range, entered: false, startedAt: Date.now() };
      playerRef.current?.playFrom(range.start);
    },
    [countedRallies, setInput],
  );

  const handleTime = useCallback(
    (seconds: number) => {
      currentTimeRef.current = seconds;
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
      // P1 では次のラリーへは進まない(入れ終えたら Enter)。区間の終わりで止める。
      if (seconds >= range.end) {
        windowRef.current = null;
        playerRef.current?.pause();
      }
    },
    [onActivity],
  );

  const jump = useCallback(
    (delta: number) => {
      windowRef.current = null;
      playerRef.current?.seek(getTime() + delta);
    },
    [getTime],
  );

  const changeRate = useCallback((next: number) => {
    setRate(next);
    playerRef.current?.setRate(next);
  }, []);

  useEffect(() => {
    if (selectedRallyId) {
      rowRefs.current.get(selectedRallyId)?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedRallyId]);

  // ---- タッチの編集 ----

  const changePlays = useCallback(
    (change: (plays: IaPlay[]) => IaPlay[]) => {
      if (!current) {
        return;
      }
      const { servingTeam, server } = current.result;
      onChangeRally(current.rally.id, (rally) => ({
        ...rally,
        plays: change(syncServePlay(rally, servingTeam, server)),
      }));
    },
    [current, onChangeRally],
  );

  const addPlay = useCallback(
    (shirt: number, time: number | null) => {
      if (!current) {
        return;
      }
      const latest = inputRef.current;
      const team = latest.flipTeam ? otherCode(prediction.team) : prediction.team;
      const play: IaPlay = {
        id: createObjectId(),
        team,
        player: shirt,
        skill: latest.skill ?? prediction.skill,
        time: roundTime(time ?? getTime()),
        source: "manual",
      };
      changePlays((list) => [...list, play]);
      lastCommitRef.current = { playId: play.id, at: Date.now() };
      setInput(EMPTY_INPUT);
      setMessage("");
    },
    [changePlays, current, getTime, prediction, setInput],
  );

  const updatePlay = useCallback(
    (playId: string, patch: Partial<Pick<IaPlay, "player" | "skill" | "team" | "time">>) => {
      changePlays((list) =>
        list.map((play) => {
          if (play.id !== playId) {
            return play;
          }
          if (play.skill === "S" && play.source !== undefined) {
            // サーブはチームとスキルを変えない(P0 のサーブの向きで決まる)。背番号を変えたら人が決めたものにする
            return patch.player !== undefined ? { ...play, player: patch.player, source: "manual" } : play;
          }
          const next = { ...play, ...patch };
          // P2 で入れた評価は、スキルかチームが変わったら決め直す
          if ((next.skill !== play.skill || next.team !== play.team) && play.effectSource !== undefined) {
            delete next.effect;
            delete next.effectSource;
          }
          return next;
        }),
      );
    },
    [changePlays],
  );

  const removePlay = useCallback(
    (playId: string) => {
      changePlays((list) => list.filter((play, index) => index === 0 || play.id !== playId));
      setSelectedPlayId((selected) => (selected === playId ? null : selected));
    },
    [changePlays],
  );

  const commitBuffer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const latest = inputRef.current;
    const shirt = Number(latest.buffer);
    if (!latest.buffer || !Number.isFinite(shirt)) {
      return;
    }
    addPlay(shirt, latest.bufferTime);
  }, [addPlay]);

  const commitRef = useRef(commitBuffer);
  useEffect(() => {
    commitRef.current = commitBuffer;
  }, [commitBuffer]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const typeDigit = useCallback(
    (digit: string) => {
      if (!current) {
        return;
      }
      const latest = inputRef.current;
      const buffer = latest.buffer.length >= 2 ? digit : latest.buffer + digit;
      const next = { ...latest, buffer, bufferTime: latest.buffer ? latest.bufferTime : getTime() };
      setInput(next);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (isShirtUnambiguous(buffer, shirts)) {
        commitRef.current();
      } else {
        timerRef.current = window.setTimeout(() => commitRef.current(), COMMIT_DELAY_MS);
      }
    },
    [current, getTime, setInput, shirts],
  );

  /** スキルのキー・Tab の行き先:打ちかけがあればそれ、決めた直後ならそのタッチ、ほかは次のタッチ。 */
  const targetOfOverride = useCallback((): { kind: "next" } | { kind: "last"; play: IaPlay } => {
    const latest = inputRef.current;
    const last = lastCommitRef.current;
    if (!latest.buffer && last && Date.now() - last.at < LAST_PLAY_WINDOW_MS) {
      const play = plays.find((entry) => entry.id === last.playId);
      if (play) {
        return { kind: "last", play };
      }
    }
    return { kind: "next" };
  }, [plays]);

  const overrideSkill = useCallback(
    (skill: IaSkill) => {
      const target = targetOfOverride();
      if (target.kind === "last") {
        updatePlay(target.play.id, { skill });
        return;
      }
      setInput({ ...inputRef.current, skill: skill === prediction.skill && !inputRef.current.flipTeam ? null : skill });
    },
    [prediction.skill, setInput, targetOfOverride, updatePlay],
  );

  const toggleTeam = useCallback(() => {
    const target = targetOfOverride();
    if (target.kind === "last") {
      updatePlay(target.play.id, { team: otherCode(target.play.team) });
      return;
    }
    setInput({ ...inputRef.current, flipTeam: !inputRef.current.flipTeam });
  }, [setInput, targetOfOverride, updatePlay]);

  const goRally = useCallback(
    (delta: number) => {
      if (entries.length === 0) {
        return;
      }
      if (current && delta > 0) {
        // Enter で次へ進んだら、このラリーは入れ終えた(サーブだけでも)
        const { servingTeam, server } = current.result;
        onChangeRally(current.rally.id, (rally) => ({
          ...rally,
          plays: syncServePlay(rally, servingTeam, server),
          flowDone: true,
        }));
      }
      const next = currentIndex === -1 ? entries[0] : entries[currentIndex + delta];
      if (!next) {
        windowRef.current = null;
        playerRef.current?.pause();
        setMessage(delta > 0 ? "このセットの最後のラリーです。" : "このセットの最初のラリーです。");
        return;
      }
      setMessage("");
      playRally(next.rally.id);
    },
    [current, currentIndex, entries, onChangeRally, playRally],
  );

  const backspace = useCallback(() => {
    const latest = inputRef.current;
    if (latest.buffer) {
      const buffer = latest.buffer.slice(0, -1);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setInput({ ...latest, buffer, bufferTime: buffer ? latest.bufferTime : null });
      return;
    }
    const last = plays.at(-1);
    if (last && plays.length > 1) {
      removePlay(last.id);
      lastCommitRef.current = null;
    }
  }, [plays, removePlay, setInput]);

  // ---- キー ----

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const key = event.key;
      let handled = true;
      if (/^[0-9]$/.test(key)) {
        typeDigit(key);
      } else if (key.length === 1 && SKILL_KEYS[key]) {
        overrideSkill(SKILL_KEYS[key]);
      } else if (key === "Tab") {
        toggleTeam();
      } else if (key === "Backspace") {
        backspace();
      } else if (key === " ") {
        windowRef.current = null;
        playerRef.current?.togglePlay();
      } else if (key === "ArrowLeft") {
        jump(-JUMP_SECONDS);
      } else if (key === "ArrowRight") {
        jump(JUMP_SECONDS);
      } else if (key === "Enter") {
        if (inputRef.current.buffer) {
          commitBuffer();
        } else {
          goRally(event.shiftKey ? -1 : 1);
        }
      } else if (key === "Escape") {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setInput(EMPTY_INPUT);
        setSelectedPlayId(null);
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
  }, [backspace, commitBuffer, goRally, jump, onActivity, overrideSkill, setInput, toggleTeam, typeDigit]);

  // ---- 画面 ----

  return (
    <div className="ia-p0 ia-p1">
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
            <span className="muted">P1 の時間:{passSeconds}</span>
          </div>

          {current ? (
            <>
              <div className="ia-flow-head">
                <strong>
                  {current.result.number}本目 {formatClock(current.rally.serveTime)}
                </strong>
                <span className="muted">
                  {current.result.scoreBefore.home}-{current.result.scoreBefore.away} → 点:{session.teams[current.result.pointWinner].name}
                  {current.result.pointGuessed ? "?" : ""}
                </span>
              </div>
              <div className={`ia-next ${teamClass(nextTeam)}`}>
                <div className="ia-next-main">
                  <span className="muted">次</span>
                  <strong className="ia-next-team">{teamName(nextTeam)}</strong>
                  <strong className="ia-next-skill">
                    {nextSkill} {SKILL_LABELS[nextSkill]}
                  </strong>
                  <span className="ia-next-buffer mono" aria-live="polite">
                    {input.buffer ? `${input.buffer}番` : "背番号"}
                  </span>
                </div>
                <p className="muted ia-note">
                  {input.skill || input.flipTeam ? "予想から変えています(Esc で戻す)。" : null}
                  {prediction.alternatives.length > 0
                    ? `ほかに:${prediction.alternatives.map((skill) => `${skill.toLowerCase()} ${SKILL_LABELS[skill]}`).join("・")}`
                    : null}
                </p>
                <div className="ia-candidates">
                  {candidates.length === 0 ? (
                    <span className="muted ia-note">スタメンが入っていないので、候補を出せません(背番号は打てます)。</span>
                  ) : (
                    candidates.map((candidate) => (
                      <button
                        type="button"
                        key={`${candidate.label}-${candidate.shirt}`}
                        className={`ia-candidate ia-candidate-${candidate.row}`}
                        onClick={() => addPlay(candidate.shirt, null)}
                        title={candidate.name}
                      >
                        <strong>{candidate.shirt}</strong>
                        <span>
                          {candidate.label}
                          {candidate.isSetter ? "・S" : ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <ol className="ia-plays">
                {plays.map((play, index) => (
                  <li key={play.id} className={play.id === selectedPlayId ? "ia-play-active" : ""}>
                    <button
                      type="button"
                      className={`ia-play ${teamClass(play.team)}`}
                      onClick={() => {
                        setSelectedPlayId(play.id === selectedPlayId ? null : play.id);
                        if (typeof play.time === "number") {
                          windowRef.current = null;
                          playerRef.current?.seek(play.time);
                        }
                      }}
                    >
                      <span className="ia-rally-no">{index + 1}</span>
                      <span className="ia-play-team">{teamName(play.team)}</span>
                      <strong className="mono">{play.player}</strong>
                      <span>
                        {play.skill} {SKILL_LABELS[play.skill]}
                      </span>
                      <span className="mono muted">{typeof play.time === "number" ? formatClock(play.time) : ""}</span>
                      {play.source === "auto" ? <span className="tag">自動</span> : null}
                    </button>
                    {play.id === selectedPlayId && selectedPlay ? (
                      <PlayEditor
                        play={selectedPlay}
                        isServe={index === 0}
                        teamName={teamName}
                        getTime={getTime}
                        onChange={(patch) => updatePlay(play.id, patch)}
                        onRemove={() => removePlay(play.id)}
                        onClose={() => setSelectedPlayId(null)}
                      />
                    ) : null}
                  </li>
                ))}
              </ol>

              {warnings.length > 0 ? (
                <ul className="ia-warnings">
                  {warnings.map((warning, index) => (
                    <li key={`${warning.playId ?? "rally"}-${index}`}>{warning.message}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="muted ia-note">
              {entries.length === 0
                ? "このセットには、向きの決まったラリーがありません。先に P0 でラリーを確かめてください。"
                : "右の一覧からラリーを選ぶか、Enter で始めます。"}
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
                <kbd>背番号</kbd> 予想のスキルとチームで入れる(2桁目を待つときは 0.6 秒か <kbd>Enter</kbd>)
              </li>
              <li>
                <kbd>s</kbd>
                <kbd>r</kbd>
                <kbd>e</kbd>
                <kbd>a</kbd>
                <kbd>b</kbd>
                <kbd>d</kbd>
                <kbd>f</kbd> スキルを変える(背番号を打つ前なら次のタッチ、入れた直後ならそのタッチ)
              </li>
              <li>
                <kbd>Tab</kbd> チームを入れ替える / <kbd>Backspace</kbd> 1つ消す / <kbd>Esc</kbd> 打ちかけをやめる
              </li>
              <li>
                <kbd>Space</kbd> 再生・停止 / <kbd>←</kbd>
                <kbd>→</kbd> 2秒 / <kbd>Enter</kbd> 次のラリー / <kbd>Shift</kbd>+<kbd>Enter</kbd> 前のラリー
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
                  entry.total > 0 && entry.entered === entry.total ? "ia-check-ok" : ""
                }`}
                onClick={() => onSelectSet(entry.setIndex)}
              >
                <strong>{entry.setIndex}セット目</strong>
                <span>
                  入力 {entry.entered} / {entry.total}
                </span>
              </button>
            ))}
          </div>
          <div className="ia-rally-head">
            <h3 className="ia-subheading">{set.setIndex}セット目のラリー</h3>
            <span className="muted">{setProgress ? `${setProgress.entered} / ${setProgress.total} 本` : ""}</span>
          </div>
          {entries.length === 0 ? (
            <p className="muted">ラリーがありません。</p>
          ) : (
            <ol className="ia-rally-list">
              {entries.map(({ rally, result }) => {
                const rallyPlays = syncServePlay(rally, result.servingTeam, result.server);
                const entered = isFlowEntered(rally);
                return (
                  <li
                    key={rally.id}
                    className={`ia-rally ${rally.id === selectedRallyId ? "ia-rally-active" : ""}`}
                    ref={(element) => {
                      if (element) {
                        rowRefs.current.set(rally.id, element);
                      } else {
                        rowRefs.current.delete(rally.id);
                      }
                    }}
                  >
                    <button type="button" className="ia-rally-main" onClick={() => playRally(rally.id)}>
                      <span className="ia-rally-no">{result.number}</span>
                      <span className="mono">{formatClock(rally.serveTime)}</span>
                      <span className="ia-side ia-flow-summary">
                        {rallyPlays.map((play) => (
                          <span key={play.id} className={teamClass(play.team)}>
                            {play.player}
                            {play.skill}
                          </span>
                        ))}
                      </span>
                      <span className="ia-rally-meta">
                        → {result.scoreAfter.home}-{result.scoreAfter.away}
                      </span>
                      <span className="ia-rally-flags">{entered ? <span className="ia-checked">入力済み</span> : null}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function PlayEditor({
  play,
  isServe,
  teamName,
  getTime,
  onChange,
  onRemove,
  onClose,
}: {
  play: IaPlay;
  isServe: boolean;
  teamName: (team: IaTeamCode) => string;
  getTime: () => number;
  onChange: (patch: Partial<Pick<IaPlay, "player" | "skill" | "team" | "time">>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [shirt, setShirt] = useState(String(play.player));
  const locked = isServe;

  function commitShirt() {
    const number = Math.trunc(Number(shirt));
    if (Number.isFinite(number) && number >= 0 && number !== play.player) {
      onChange({ player: number });
    }
  }

  return (
    <div className="ia-play-editor ia-inline-form">
      <div className="field">
        <label htmlFor={`ia-play-shirt-${play.id}`}>背番号</label>
        <input
          id={`ia-play-shirt-${play.id}`}
          type="number"
          min={0}
          max={99}
          value={shirt}
          onChange={(event) => setShirt(event.target.value)}
          onBlur={commitShirt}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitShirt();
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`ia-play-skill-${play.id}`}>スキル</label>
        <select
          id={`ia-play-skill-${play.id}`}
          value={play.skill}
          disabled={locked}
          onChange={(event) => {
            onChange({ skill: event.target.value as IaSkill });
            event.currentTarget.blur();
          }}
        >
          {IA_SKILLS.map((skill) => (
            <option key={skill} value={skill}>
              {skill} {SKILL_LABELS[skill]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={locked}
        onClick={() => onChange({ team: otherCode(play.team) })}
      >
        チームを{teamName(otherCode(play.team))}に
      </button>
      {!locked ? (
        <button type="button" className="button secondary" onClick={() => onChange({ time: roundTime(getTime()) })}>
          今の時刻にする
        </button>
      ) : null}
      {!locked ? (
        <button type="button" className="button secondary" onClick={onRemove}>
          消す
        </button>
      ) : null}
      <button type="button" className="button secondary" onClick={onClose}>
        閉じる
      </button>
      {locked ? <p className="muted ia-note">サーブのチームと時刻は P0 で決まります(背番号だけ編集できます)。</p> : null}
    </div>
  );
}
