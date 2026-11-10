"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import { IaPlayer, type IaPlayerHandle } from "@/components/input-assist/ia-player";
import { IaRateButtons } from "@/components/input-assist/ia-rate-buttons";
import { usePlaybackRate } from "@/components/input-assist/use-playback-rate";
import { formatClock, isTypingTarget } from "@/components/input-assist/ia-utils";
import { courtSideOf, getCountedRallies, type IaSetResult } from "@/lib/domain/input-assist/engine";
import { SKILL_LABELS, sideOfCode, syncServePlay } from "@/lib/domain/input-assist/flow";
import { getRallyWindow } from "@/lib/domain/input-assist/session";
import type { IaCourtSide, IaPlay, IaRally, IaSet, IaTeamCode, InputAssistSession } from "@/lib/domain/input-assist/types";
import {
  IA_SUB_ZONES,
  SERVE_ZONES,
  ZONE_ROWS,
  applyBallPosition,
  applyZoneChain,
  buildZoneQueue,
  formatZone,
  isZoneStepDone,
  isZoneStepNeeded,
  locateOnDiagram,
  nextZoneStep,
  parseZoneKeys,
  sameZoneItem,
  serveZoneAt,
  serveZoneCenter,
  toDiagram,
  zoneAt,
  zoneCenter,
  zoneOfStep,
  zoneRallies,
  zoneStepCount,
  zoneStepSource,
  type IaDiagramPoint,
  type IaZonePosition,
  type IaZoneProgress,
  type ZoneQueueItem,
  type ZoneQueueMode,
  type ZoneRallyEntry,
} from "@/lib/domain/input-assist/zone";

// P3 ゾーン:ボールが触られた位置を、1タッチ1クリックで入れる(前のタッチの終わり = 今のタッチの始まり)。
// 最後のタッチのあとに、ボールが落ちた場所を1回押す。アタックの始まりは攻撃コンビから自動で入る。

/** タッチの何秒前から何秒後まで流すか。 */
const LEAD_SECONDS = 1.5;
const TAIL_SECONDS = 1.5;
/** 落ちた場所は、最後のタッチからこの秒数まで流す。 */
const LANDING_SECONDS = 3;

// 図の大きさ(1m = 30)。横はコート 9m + 両側 1m、縦はサーブの帯 2m + コート 18m + サーブの帯 2m。
const METER = 30;
const SIDE = METER;
const BAND = 2 * METER;
const COURT_WIDTH = 9 * METER;
const COURT_LENGTH = 18 * METER;
/** 上下の、チームの名前を書く余白。 */
const TOP = 24;
const VIEW_WIDTH = COURT_WIDTH + 2 * SIDE;
const VIEW_HEIGHT = COURT_LENGTH + 2 * BAND + 2 * TOP;
/** 奥のエンドラインの y と、ネットの y。 */
const COURT_TOP = TOP + BAND;
const NET_Y = COURT_TOP + COURT_LENGTH / 2;

function toView(point: IaDiagramPoint): { x: number; y: number } {
  return { x: SIDE + point.u * COURT_WIDTH, y: COURT_TOP + point.v * COURT_LENGTH };
}

type IaZonePassProps = {
  session: InputAssistSession;
  set: IaSet;
  setResult: IaSetResult;
  progress: IaZoneProgress[];
  passSeconds: string;
  onSelectSet: (setIndex: number) => void;
  onChangeRally: (rallyId: string, change: (rally: IaRally) => IaRally) => void;
  onActivity: () => void;
};

type HoverPosition = { side: IaCourtSide; position: IaZonePosition };

type UndoEntry = { rallyId: string; plays: IaPlay[] | undefined; item: ZoneQueueItem };

/** 図に置くときの、そのステップの位置のコート。タッチはそのチームのコート、落ちた場所はサーブ・アタック・ブロックなら相手のコート。 */
function stepSide(set: IaSet, plays: IaPlay[], step: number): IaCourtSide | null {
  const play = step < plays.length ? plays[step] : plays.at(-1);
  if (!play) {
    return null;
  }
  const own = courtSideOf(set, sideOfCode(play.team));
  if (step < plays.length) {
    return own;
  }
  const crosses = play.skill === "S" || play.skill === "A" || play.skill === "B";
  return crosses ? (own === "near" ? "far" : "near") : own;
}

function stepLabel(plays: IaPlay[], step: number): string {
  if (step === plays.length) {
    return "落ちた場所";
  }
  const play = plays[step];
  return step === 0 && play.skill === "S" ? "サーブを打った位置" : `${SKILL_LABELS[play.skill]}で触った位置`;
}

export function IaZonePass({
  session,
  set,
  setResult,
  progress,
  passSeconds,
  onSelectSet,
  onChangeRally,
  onActivity,
}: IaZonePassProps) {
  const entries = useMemo(() => zoneRallies(set), [set]);
  const countedRallies = useMemo(() => getCountedRallies(set), [set]);
  const [mode, setMode] = useState<ZoneQueueMode>("needed");
  const queue = useMemo(() => buildZoneQueue(entries, mode), [entries, mode]);
  const allSteps = useMemo(() => buildZoneQueue(entries, "all"), [entries]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.rally.id, entry])), [entries]);
  const isDone = useCallback(
    (item: ZoneQueueItem) => {
      const entry = entryById.get(item.rallyId);
      return entry ? isZoneStepDone(entry.plays, item.step) : false;
    },
    [entryById],
  );

  const [current, setCurrent] = useState<ZoneQueueItem | null>(() => {
    const initial = buildZoneQueue(entries, "needed");
    const byId = new Map(entries.map((entry) => [entry.rally.id, entry]));
    return (
      nextZoneStep(initial, (item) => isZoneStepDone(byId.get(item.rallyId)?.plays ?? [], item.step), null) ??
      initial[0] ??
      null
    );
  });
  const [buffer, setBuffer] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [message, setMessage] = useState("");
  const [hover, setHover] = useState<HoverPosition | null>(null);
  const undoRef = useRef<UndoEntry[]>([]);

  const playerRef = useRef<IaPlayerHandle | null>(null);
  const { rate, changeRate } = usePlaybackRate(playerRef);
  const windowRef = useRef<{ start: number; end: number; entered: boolean; startedAt: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const svgRef = useRef<SVGSVGElement | null>(null);

  const foundEntry = current ? entryById.get(current.rallyId) : undefined;
  // P1 でタッチが減ったときなど、ステップがラリーの外になったら選んでいないことにする
  const currentEntry = foundEntry && current && current.step <= foundEntry.plays.length ? foundEntry : undefined;
  const currentStep = current?.step ?? -1;
  const currentPlays = useMemo(() => currentEntry?.plays ?? [], [currentEntry]);
  const isServeStep = currentStep === 0 && currentPlays[0]?.skill === "S";
  const isLandingStep = currentEntry !== undefined && currentStep === currentPlays.length;
  const result = currentEntry ? setResult.byRallyId.get(currentEntry.rally.id) : undefined;
  const setProgress = progress.find((entry) => entry.setIndex === set.setIndex);
  const expectedSide = currentEntry ? stepSide(set, currentPlays, currentStep) : null;

  const teamName = useCallback((team: IaTeamCode) => session.teams[sideOfCode(team)].name, [session.teams]);
  const teamClass = useCallback((team: IaTeamCode) => `ia-team-${courtSideOf(set, sideOfCode(team))}`, [set]);

  // ---- 動画 ----

  const playStep = useCallback(
    (item: ZoneQueueItem) => {
      setCurrent(item);
      setBuffer("");
      const entry = entryById.get(item.rallyId);
      if (!entry) {
        return;
      }
      const landing = item.step >= entry.plays.length;
      const play = landing ? entry.plays.at(-1) : entry.plays[item.step];
      const time = play?.time ?? entry.rally.serveTime;
      const start = Math.max(0, time - LEAD_SECONDS);
      let end = time + (landing ? LANDING_SECONDS : TAIL_SECONDS);
      if (landing) {
        const range = getRallyWindow(countedRallies, entry.rally.id);
        end = Math.min(range?.end ?? end, end);
      }
      windowRef.current = { start, end: Math.max(end, time + 1), entered: false, startedAt: Date.now() };
      playerRef.current?.playFrom(start);
    },
    [countedRallies, entryById],
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


  useEffect(() => {
    if (current) {
      rowRefs.current.get(current.rallyId)?.scrollIntoView({ block: "nearest" });
    }
  }, [current]);

  // ---- 位置を決める ----

  const savePosition = useCallback(
    (item: ZoneQueueItem, position: IaZonePosition | null) => {
      const rallyResult = setResult.byRallyId.get(item.rallyId);
      const entry = entryById.get(item.rallyId);
      if (!rallyResult || !entry) {
        return;
      }
      undoRef.current = [...undoRef.current.slice(-49), { rallyId: item.rallyId, plays: entry.rally.plays, item }];
      onChangeRally(item.rallyId, (rally) => {
        const synced = applyZoneChain(syncServePlay(rally, rallyResult.servingTeam, rallyResult.server));
        return { ...rally, plays: applyBallPosition(synced, item.step, position) };
      });
    },
    [entryById, onChangeRally, setResult.byRallyId],
  );

  /** 並びの中で前後に動く。今のステップが並びにないときは、全部の並びの順で次(前)にある並びのステップへ。 */
  const neighbor = useCallback(
    (from: ZoneQueueItem | null, delta: number): ZoneQueueItem | null => {
      if (queue.length === 0) {
        return null;
      }
      if (!from) {
        return delta > 0 ? queue[0] : (queue.at(-1) ?? null);
      }
      const index = queue.findIndex((item) => sameZoneItem(item, from));
      if (index !== -1) {
        return queue[index + delta] ?? null;
      }
      const order = new Map(allSteps.map((item, position) => [`${item.rallyId}:${item.step}`, position]));
      const position = order.get(`${from.rallyId}:${from.step}`) ?? -1;
      const candidates = delta > 0 ? queue : [...queue].reverse();
      return (
        candidates.find((item) => {
          const other = order.get(`${item.rallyId}:${item.step}`) ?? -1;
          return delta > 0 ? other > position : other < position;
        }) ?? null
      );
    },
    [allSteps, queue],
  );

  const choose = useCallback(
    (position: IaZonePosition) => {
      if (!current) {
        return;
      }
      const wasDone = isDone(current);
      savePosition(current, position);
      // 直しているとき(もう決まっていたステップ)と「全部」のときは、すぐ次のステップへ。ふだんは、次の決まっていないステップへ
      const settled = (item: ZoneQueueItem) => sameZoneItem(item, current) || isDone(item);
      const next =
        mode === "needed" && !wasDone
          ? (nextZoneStep(queue, settled, current) ?? nextZoneStep(queue, settled, null))
          : neighbor(current, 1);
      setBuffer("");
      if (!next) {
        windowRef.current = null;
        playerRef.current?.pause();
        setMessage(mode === "needed" ? "このセットの要るゾーンは、全部入りました。" : "このセットの最後のステップです。");
        return;
      }
      setMessage("");
      playStep(next);
    },
    [current, isDone, mode, neighbor, playStep, queue, savePosition],
  );

  const move = useCallback(
    (delta: number) => {
      const next = neighbor(current, delta);
      if (!next) {
        setMessage(delta > 0 ? "並びの最後のステップです。" : "並びの最初のステップです。");
        return;
      }
      setMessage("");
      playStep(next);
    },
    [current, neighbor, playStep],
  );

  const undo = useCallback(() => {
    const last = undoRef.current.at(-1);
    if (!last) {
      setMessage("戻せる操作がありません。");
      return;
    }
    undoRef.current = undoRef.current.slice(0, -1);
    onChangeRally(last.rallyId, (rally) => {
      const restored = { ...rally };
      if (last.plays === undefined) {
        delete restored.plays;
      } else {
        restored.plays = last.plays;
      }
      return restored;
    });
    setMessage("1つ前に戻しました。");
    playStep(last.item);
  }, [onChangeRally, playStep]);

  const clearStep = useCallback(() => {
    if (current) {
      savePosition(current, null);
      setMessage("このステップの位置を消しました。");
    }
  }, [current, savePosition]);

  const replay = useCallback(() => {
    if (current) {
      playStep(current);
    } else {
      move(1);
    }
  }, [current, move, playStep]);

  const confirmBuffer = useCallback(() => {
    if (!current) {
      move(1);
      return;
    }
    if (!buffer) {
      // 自動で入っている(攻撃コンビなど)なら、そのまま次へ
      if (isDone(current)) {
        move(1);
      }
      return;
    }
    const position = parseZoneKeys(buffer);
    if (position) {
      choose(position);
    }
  }, [buffer, choose, current, isDone, move]);

  // ---- 図を押す ----

  const pointFromEvent = useCallback((event: PointerEvent<SVGSVGElement>): IaDiagramPoint | null => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_HEIGHT;
    return { u: (x - SIDE) / COURT_WIDTH, v: (y - COURT_TOP) / COURT_LENGTH };
  }, []);

  const positionAt = useCallback(
    (point: IaDiagramPoint): IaZonePosition => {
      if (isServeStep) {
        // サーブは、サーブしたチームのエンドラインに沿った左右の位置だけで決める
        const serverSide = courtSideOf(set, sideOfCode(currentPlays[0].team));
        return { zone: serveZoneAt(serverSide === "near" ? point.u : 1 - point.u) };
      }
      return zoneAt(locateOnDiagram(point));
    },
    [currentPlays, isServeStep, set],
  );

  const handleCourtClick = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const point = pointFromEvent(event);
      if (!point) {
        return;
      }
      onActivity();
      choose(positionAt(point));
    },
    [choose, onActivity, pointFromEvent, positionAt],
  );

  const handleCourtMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const point = pointFromEvent(event);
      setHover(point ? { side: locateOnDiagram(point).side, position: positionAt(point) } : null);
    },
    [pointFromEvent, positionAt],
  );

  // ---- キー ----

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const key = event.key;
      let handled = true;
      if (/^[1-9]$/.test(key)) {
        setBuffer(key);
      } else if (/^[a-dA-D]$/.test(key)) {
        setBuffer((value) => (/^[1-9]/.test(value) ? `${value[0]}${key.toUpperCase()}` : value));
      } else if (key === "Enter") {
        confirmBuffer();
      } else if (key === "Backspace") {
        if (buffer) {
          setBuffer((value) => value.slice(0, -1));
        } else {
          undo();
        }
      } else if (key === "Delete") {
        clearStep();
      } else if (key === "Escape") {
        setBuffer("");
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
  }, [buffer, clearStep, confirmBuffer, move, onActivity, replay, undo]);

  // ---- 画面 ----

  const queueIndex = current ? queue.findIndex((item) => sameZoneItem(item, current)) : -1;
  const neededCount = useMemo(() => buildZoneQueue(entries, "needed").length, [entries]);
  const currentPosition = currentEntry ? zoneOfStep(currentPlays, currentStep) : null;
  const typed = parseZoneKeys(buffer);

  return (
    <div className="ia-p0 ia-p3">
      <section className="panel ia-video-panel">
        <div className="panel-inner stack">
          <IaPlayer ref={playerRef} youtubeUrl={set.youtubeUrl} onTime={handleTime} />
          <div className="ia-now">
            <span className="mono">{formatClock(currentTime)}</span>
            <IaRateButtons rate={rate} onChange={changeRate} />
            <span className="ia-rates" role="group" aria-label="押すステップ">
              <button
                type="button"
                className={`ia-rate ${mode === "needed" ? "ia-rate-active" : ""}`}
                onClick={() => setMode("needed")}
                title="田中がふだん入れるゾーンだけ(ブロックのあと・ディグの終わりなどは飛ばす)"
              >
                ゾーンが要るタッチだけ({neededCount})
              </button>
              <button
                type="button"
                className={`ia-rate ${mode === "all" ? "ia-rate-active" : ""}`}
                onClick={() => setMode("all")}
              >
                全部({allSteps.length})
              </button>
            </span>
            <span className="muted">P3 の時間:{passSeconds}</span>
          </div>

          {currentEntry ? (
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

              <div
                className={`ia-next ${
                  isLandingStep ? "" : teamClass(currentPlays[currentStep]?.team ?? "*")
                }`}
              >
                <div className="ia-next-main">
                  <strong className="ia-next-team">
                    {isLandingStep ? "ボール" : teamName(currentPlays[currentStep].team)}
                  </strong>
                  <strong className="ia-next-skill">
                    {isLandingStep
                      ? "落ちた場所"
                      : `${currentPlays[currentStep].player}番 ${currentPlays[currentStep].skill} ${SKILL_LABELS[currentPlays[currentStep].skill]}`}
                  </strong>
                  <span className="ia-next-buffer mono" aria-live="polite">
                    {buffer || formatZone(currentPosition?.zone, currentPosition?.subZone) || "?"}
                  </span>
                </div>
                <p className="muted ia-note">
                  {isServeStep
                    ? "サーブを打った位置を押す(エンドラインの後ろ。左から 5・7・6・9・1)"
                    : isLandingStep
                      ? "ボールが落ちた場所(最後のタッチの終わり)を押す"
                      : `${stepLabel(currentPlays, currentStep)}を押す(前のタッチの終わりにもなる)`}
                  {zoneStepSource(currentPlays, currentStep) === "auto" ? "。自動で入りました(押すと上書き。Enter でそのまま次へ)" : ""}
                  {zoneStepSource(currentPlays, currentStep) === "loaded" ? "。読み込んだゾーン" : ""}
                  {buffer && !typed ? "。ゾーンは 1〜9" : ""}
                </p>
              </div>

              <ol className="ia-plays">
                {Array.from({ length: zoneStepCount(currentPlays) }, (_, step) => {
                  const landing = step === currentPlays.length;
                  const play = landing ? undefined : currentPlays[step];
                  const position = zoneOfStep(currentPlays, step);
                  const source = zoneStepSource(currentPlays, step);
                  const needed = isZoneStepNeeded(currentPlays, step);
                  return (
                    <li key={landing ? "landing" : play?.id} className={step === currentStep ? "ia-play-active" : ""}>
                      <button
                        type="button"
                        className={`ia-play ia-play-zone ${play ? teamClass(play.team) : ""}`}
                        onClick={() => playStep({ rallyId: currentEntry.rally.id, step })}
                      >
                        <span className="ia-rally-no">{landing ? "↓" : step + 1}</span>
                        <span className="ia-play-team">{play ? teamName(play.team) : "落ちた場所"}</span>
                        <strong className="mono">{play?.player ?? ""}</strong>
                        <span>{play ? `${play.skill} ${SKILL_LABELS[play.skill]}` : ""}</span>
                        <span className="mono muted">{play && typeof play.time === "number" ? formatClock(play.time) : ""}</span>
                        <span
                          className={`ia-zone-badge mono ${source === "auto" ? "ia-effect-auto" : ""} ${
                            !position && needed ? "ia-effect-unsure" : ""
                          }`}
                        >
                          {position ? formatZone(position.zone, position.subZone) : needed ? "?" : "–"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="muted ia-note">
              {entries.length === 0
                ? "このセットには、P1 を入れ終えたラリーがありません。先に P1 でタッチを入れてください。"
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
              <li>コートを押す:ボールが触られた位置を決めて、次のタッチへ。最後のタッチのあとは、落ちた場所</li>
              <li>
                <kbd>1</kbd>〜<kbd>9</kbd> ゾーン + <kbd>a</kbd>〜<kbd>d</kbd> サブゾーン → <kbd>Enter</kbd> で決める(Enter だけなら、自動で入った位置のまま次へ)
              </li>
              <li>
                <kbd>Backspace</kbd> 1つ前に戻す / <kbd>Delete</kbd> このステップの位置を消す / <kbd>Space</kbd> もう一度流す / <kbd>←</kbd>
                <kbd>→</kbd> 前・次のタッチ
              </li>
            </ul>
          </details>
        </div>
      </section>

      <section className="panel ia-rally-panel">
        <div className="panel-inner stack">
          <ZoneCourt
            set={set}
            session={session}
            entry={currentEntry}
            step={currentStep}
            expectedSide={expectedSide}
            serveStep={isServeStep}
            hover={hover}
            typed={typed}
            svgRef={svgRef}
            onClick={handleCourtClick}
            onMove={handleCourtMove}
            onLeave={() => setHover(null)}
          />
          <div className="ia-flow-progress">
            {progress.map((entry) => (
              <button
                type="button"
                key={entry.setIndex}
                className={`ia-check-card ${entry.setIndex === set.setIndex ? "ia-check-card-active" : ""} ${
                  entry.needed > 0 && entry.done === entry.needed ? "ia-check-ok" : ""
                }`}
                onClick={() => onSelectSet(entry.setIndex)}
              >
                <strong>{entry.setIndex}セット目</strong>
                <span>
                  ゾーン {entry.done} / {entry.needed}
                </span>
                <span>ラリー {entry.rallies} 本</span>
              </button>
            ))}
          </div>
          <div className="ia-rally-head">
            <h3 className="ia-subheading">{set.setIndex}セット目のタッチ</h3>
            <span className="muted">{setProgress ? `${setProgress.done} / ${setProgress.needed}` : ""}</span>
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
                    {Array.from({ length: zoneStepCount(entry.plays) }, (_, step) => {
                      const landing = step === entry.plays.length;
                      const play = landing ? undefined : entry.plays[step];
                      const position = zoneOfStep(entry.plays, step);
                      const needed = isZoneStepNeeded(entry.plays, step);
                      const classes = [
                        "ia-chip",
                        play ? teamClass(play.team) : "",
                        sameZoneItem(current, { rallyId: entry.rally.id, step }) ? "ia-chip-current" : "",
                        zoneStepSource(entry.plays, step) === "auto" ? "ia-chip-auto" : "",
                        !position && needed ? "ia-chip-unsure" : "",
                      ].join(" ");
                      return (
                        <button
                          type="button"
                          key={landing ? "landing" : play?.id}
                          className={classes}
                          title={play ? `${teamName(play.team)} ${play.player}番 ${SKILL_LABELS[play.skill]}` : "落ちた場所"}
                          onClick={() => playStep({ rallyId: entry.rally.id, step })}
                        >
                          {play ? `${play.player}${play.skill}` : "↓"}
                          <strong>{position ? formatZone(position.zone, position.subZone) : needed ? "?" : "–"}</strong>
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

// ---- コートの図 ----

type ZoneCourtProps = {
  set: IaSet;
  session: InputAssistSession;
  entry: ZoneRallyEntry | undefined;
  step: number;
  expectedSide: IaCourtSide | null;
  serveStep: boolean;
  hover: HoverPosition | null;
  typed: IaZonePosition | null;
  svgRef: RefObject<SVGSVGElement | null>;
  onClick: (event: PointerEvent<SVGSVGElement>) => void;
  onMove: (event: PointerEvent<SVGSVGElement>) => void;
  onLeave: () => void;
};

/** ゾーン(とサブゾーン)の四角(図の座標)。 */
function zoneRect(side: IaCourtSide, zone: number, subZone?: string) {
  const center = zoneCenter(zone, subZone);
  if (!center) {
    return null;
  }
  const size = subZone ? 1 / 6 : 1 / 3;
  const a = toView(toDiagram(side, { x: center.x - size / 2, y: center.y - size / 2 }));
  const b = toView(toDiagram(side, { x: center.x + size / 2, y: center.y + size / 2 }));
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function serveRect(side: IaCourtSide, zone: number) {
  const index = SERVE_ZONES.indexOf(zone);
  if (index === -1) {
    return null;
  }
  const width = COURT_WIDTH / SERVE_ZONES.length;
  const u = side === "near" ? index / SERVE_ZONES.length : 1 - (index + 1) / SERVE_ZONES.length;
  return { x: SIDE + u * COURT_WIDTH, y: side === "near" ? COURT_TOP + COURT_LENGTH : TOP, width, height: BAND };
}

function ZoneCourt({ set, session, entry, step, expectedSide, serveStep, hover, typed, svgRef, onClick, onMove, onLeave }: ZoneCourtProps) {
  const plays = entry?.plays ?? [];
  const sides: IaCourtSide[] = ["far", "near"];
  const serverSide = plays[0] ? courtSideOf(set, sideOfCode(plays[0].team)) : null;

  // 決まった位置に番号の印を置き、順に線でつなぐ(ボールの道筋)
  const marks = Array.from({ length: zoneStepCount(plays) }, (_, index) => {
    const position = zoneOfStep(plays, index);
    const side = stepSide(set, plays, index);
    if (!position || !side) {
      return null;
    }
    const serve = index === 0 && plays[0]?.skill === "S";
    const point = serve ? serveZoneCenter(position.zone) : zoneCenter(position.zone, position.subZone);
    if (!point) {
      return null;
    }
    return { index, ...toView(toDiagram(side, point)), auto: zoneStepSource(plays, index) === "auto" };
  }).filter((mark): mark is NonNullable<typeof mark> => mark !== null);

  const highlight = (position: IaZonePosition | null, side: IaCourtSide | null, className: string) => {
    if (!position || !side) {
      return null;
    }
    const rect = serveStep && serverSide ? serveRect(serverSide, position.zone) : zoneRect(side, position.zone, position.subZone);
    return rect ? <rect className={className} {...rect} /> : null;
  };

  const nearName = session.teams[set.nearTeam].name;
  const farName = session.teams[set.nearTeam === "home" ? "away" : "home"].name;

  return (
    <figure className="ia-zone-figure">
      <svg
        ref={svgRef}
        className="ia-zone-court"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="コートの図(押してボールの位置を決める)"
        onPointerUp={onClick}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        {sides.map((side) => {
          const top = side === "far" ? COURT_TOP : NET_Y;
          return (
            <g key={side} className={`ia-zone-half ia-zone-${side} ${expectedSide === side && !serveStep ? "ia-zone-expected" : ""}`}>
              <rect className="ia-zone-surface" x={SIDE} y={top} width={COURT_WIDTH} height={COURT_LENGTH / 2} />
              {ZONE_ROWS.flat().map((zone) => {
                const rect = zoneRect(side, zone);
                const center = zoneCenter(zone);
                const label = center ? toView(toDiagram(side, center)) : null;
                return (
                  <g key={zone}>
                    {IA_SUB_ZONES.map((subZone) => {
                      const sub = zoneRect(side, zone, subZone);
                      const subCenter = zoneCenter(zone, subZone);
                      const subLabel = subCenter ? toView(toDiagram(side, subCenter)) : null;
                      return sub && subLabel ? (
                        <g key={subZone}>
                          <rect className="ia-zone-sub" {...sub} />
                          <text className="ia-zone-sub-label" x={subLabel.x} y={subLabel.y + 4} textAnchor="middle">
                            {subZone}
                          </text>
                        </g>
                      ) : null;
                    })}
                    {rect ? <rect className="ia-zone-cell" {...rect} /> : null}
                    {label ? (
                      <text className="ia-zone-label" x={label.x} y={label.y + 9} textAnchor="middle">
                        {zone}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {SERVE_ZONES.map((zone) => {
                const rect = serveRect(side, zone);
                return rect ? (
                  <g key={`s${zone}`} className={`ia-zone-serve ${serveStep && serverSide === side ? "ia-zone-serve-active" : ""}`}>
                    <rect {...rect} />
                    <text x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 5} textAnchor="middle">
                      {zone}
                    </text>
                  </g>
                ) : null;
              })}
            </g>
          );
        })}
        <line className="ia-zone-net" x1={SIDE - 12} y1={NET_Y} x2={SIDE + COURT_WIDTH + 12} y2={NET_Y} />
        <text className="ia-zone-team ia-zone-team-far" x={VIEW_WIDTH / 2} y={TOP - 7} textAnchor="middle">
          奥:{farName}
        </text>
        <text className="ia-zone-team ia-zone-team-near" x={VIEW_WIDTH / 2} y={VIEW_HEIGHT - 7} textAnchor="middle">
          手前:{nearName}
        </text>
        {highlight(hover?.position ?? null, hover?.side ?? null, "ia-zone-hover")}
        {highlight(typed, expectedSide, "ia-zone-typed")}
        {marks.length > 1 ? (
          <polyline className="ia-zone-path" points={marks.map((mark) => `${mark.x},${mark.y}`).join(" ")} />
        ) : null}
        {marks.map((mark) => (
          <g key={mark.index} className={`ia-zone-mark ${mark.index === step ? "ia-zone-mark-current" : ""} ${mark.auto ? "ia-zone-mark-auto" : ""}`}>
            <circle cx={mark.x} cy={mark.y} r={11} />
            <text x={mark.x} y={mark.y + 4} textAnchor="middle">
              {mark.index === plays.length ? "↓" : mark.index + 1}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
