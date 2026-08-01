"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEffectGrade, getSkillLabel, getTeamLabel } from "@/lib/domain/display";
import { getRotationLabel } from "@/lib/domain/rotation";
import { calculateSeekSeconds, formatSeconds } from "@/lib/domain/video";
import type { ParsedMatch, ParsedPlay, VideoSyncSettings } from "@/lib/domain/types";

type PlayListProps = {
  match?: ParsedMatch;
  sourceMatch?: ParsedMatch;
  settings: VideoSyncSettings;
  currentPlayerSeconds?: number;
  selectedPlayKey?: string;
  selectedSetIndex?: number;
  onPauseRequest: () => void;
  onSelectedSetIndexChange: (setIndex: number) => void;
  onSelectPlay: (play: ParsedPlay, playKey: string) => void;
};

type RallyResultFilter = "all" | "scored" | "conceded";

const RALLY_TAIL_SECONDS = 3;

function getScoreBeforeRally(score: { home: number; away: number }, point?: string) {
  if (point === "*") {
    return {
      home: Math.max(0, score.home - 1),
      away: score.away,
    };
  }

  if (point === "a") {
    return {
      home: score.home,
      away: Math.max(0, score.away - 1),
    };
  }

  return score;
}

function getRallyResultClass(point?: string) {
  if (point === "*") {
    return " list-item-won";
  }

  if (point === "a") {
    return " list-item-lost";
  }

  return "";
}

function getRallyNumber(score: { home: number; away: number }) {
  return score.home + score.away + 1;
}

export function PlayList({
  match,
  sourceMatch,
  settings,
  currentPlayerSeconds,
  selectedPlayKey,
  selectedSetIndex,
  onPauseRequest,
  onSelectedSetIndexChange,
  onSelectPlay,
}: PlayListProps) {
  const [expandedRallies, setExpandedRallies] = useState<Record<string, boolean>>({});
  const [showPlayCodes, setShowPlayCodes] = useState(false);
  const [rallyResultFilter, setRallyResultFilter] = useState<RallyResultFilter>("all");
  const [minPlayCount, setMinPlayCount] = useState(1);
  const [activeRallyIndex, setActiveRallyIndex] = useState<number>();
  const [activeRallyReady, setActiveRallyReady] = useState(false);
  const [isPlayingRallies, setIsPlayingRallies] = useState(false);

  const availableSetIndices = match?.sets.map((set) => set.setIndex) ?? [];
  const timingMatch = sourceMatch ?? match;
  const effectiveSetIndex =
    selectedSetIndex ??
    availableSetIndices[0];

  const rallyItems = useMemo(
    () =>
      match?.sets.flatMap((set) =>
        typeof effectiveSetIndex === "number" && set.setIndex !== effectiveSetIndex
          ? []
          : set.events.flatMap((event) => {
              if (event.plays.length === 0) {
                return [];
              }
              if (rallyResultFilter === "scored" && event.point !== "*") {
                return [];
              }
              if (rallyResultFilter === "conceded" && event.point !== "a") {
                return [];
              }
              if (event.plays.length < minPlayCount) {
                return [];
              }

              const plays = event.plays.map((play, index) => ({
                key: `${set.id}-${event.id}-${play.id}-${index}`,
                play,
                seekSeconds: calculateSeekSeconds(
                  {
                    ...play,
                    setIndex: set.setIndex,
                  },
                  settings,
                  timingMatch,
                ),
              }));
              const timedPlays = plays
                .filter((item): item is typeof item & { seekSeconds: number } =>
                  typeof item.seekSeconds === "number",
                )
                .sort((left, right) => left.seekSeconds - right.seekSeconds);
              const firstTimedPlay = timedPlays[0];
              const lastTimedPlay = timedPlays.at(-1);

              return [
                {
                  key: `${set.id}-${event.id}`,
                  setIndex: set.setIndex,
                  eventIndex: event.eventIndex,
                  point: event.point,
                  score: getScoreBeforeRally(event.score, event.point),
                  homeRotation: getRotationLabel(event.lineup.home),
                  awayRotation: getRotationLabel(event.lineup.away),
                  plays,
                  firstSeekSeconds: firstTimedPlay?.seekSeconds,
                  durationSeconds:
                    firstTimedPlay && lastTimedPlay
                      ? Math.max(
                          RALLY_TAIL_SECONDS,
                          lastTimedPlay.seekSeconds -
                            firstTimedPlay.seekSeconds +
                            RALLY_TAIL_SECONDS,
                        )
                      : undefined,
                },
              ];
            }),
      ) ?? [],
    [effectiveSetIndex, match, minPlayCount, rallyResultFilter, settings, timingMatch],
  );

  const rallyItemsKey = rallyItems.map((rally) => rally.key).join("|");

  const playRallyFrom = useCallback(
    (index: number) => {
      const rally = rallyItems[index];
      const firstPlayable = rally?.plays.find((item) => typeof item.seekSeconds === "number");
      if (!rally || !firstPlayable) {
        return;
      }

      setActiveRallyIndex(index);
      setActiveRallyReady(false);
      setIsPlayingRallies(true);
      onSelectPlay(
        {
          ...firstPlayable.play,
          setIndex: rally.setIndex,
        },
        firstPlayable.key,
      );
    },
    [onSelectPlay, rallyItems],
  );

  useEffect(() => {
    setActiveRallyIndex(undefined);
    setActiveRallyReady(false);
    setIsPlayingRallies(false);
    onPauseRequest();
  }, [onPauseRequest, rallyItemsKey]);

  useEffect(() => {
    if (!isPlayingRallies || typeof activeRallyIndex !== "number") {
      return;
    }

    const activeRally = rallyItems[activeRallyIndex];
    if (
      !activeRally ||
      typeof activeRally.firstSeekSeconds !== "number" ||
      typeof activeRally.durationSeconds !== "number" ||
      typeof currentPlayerSeconds !== "number"
    ) {
      return;
    }

    const rallyEndSeconds = activeRally.firstSeekSeconds + activeRally.durationSeconds;
    if (!activeRallyReady) {
      if (
        currentPlayerSeconds >= activeRally.firstSeekSeconds - 0.2 &&
        currentPlayerSeconds < rallyEndSeconds
      ) {
        setActiveRallyReady(true);
      }
      return;
    }

    if (currentPlayerSeconds < rallyEndSeconds - 0.15) {
      return;
    }

    const nextIndex = activeRallyIndex + 1;
    if (nextIndex >= rallyItems.length) {
      setIsPlayingRallies(false);
      setActiveRallyIndex(undefined);
      setActiveRallyReady(false);
      onPauseRequest();
      return;
    }

    playRallyFrom(nextIndex);
  }, [
    activeRallyIndex,
    activeRallyReady,
    currentPlayerSeconds,
    isPlayingRallies,
    onPauseRequest,
    playRallyFrom,
    rallyItems,
  ]);

  function stopRallyPlayback() {
    setIsPlayingRallies(false);
    setActiveRallyIndex(undefined);
    setActiveRallyReady(false);
    onPauseRequest();
  }

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div className="play-list-header">
          <h2>プレイ一覧</h2>
          <div className="button-row">
            <button
              className={`button${showPlayCodes ? "" : " secondary"}`}
              type="button"
              aria-pressed={showPlayCodes}
              onClick={() => setShowPlayCodes((current) => !current)}
            >
              {showPlayCodes ? "打ち込みコードを隠す" : "打ち込みコードを表示"}
            </button>
            <button
              className="button"
              type="button"
              disabled={rallyItems.length === 0}
              onClick={() => playRallyFrom(activeRallyIndex ?? 0)}
            >
              {isPlayingRallies ? "再開" : "連続再生"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!isPlayingRallies}
              onClick={stopRallyPlayback}
            >
              停止
            </button>
          </div>
        </div>

        <div className="clip-filter-grid">
          <div className="field">
            <label htmlFor="play-list-set-filter">セット</label>
            <select
              id="play-list-set-filter"
              value={effectiveSetIndex}
              onChange={(event) => onSelectedSetIndexChange(Number(event.target.value))}
            >
              {availableSetIndices.map((setIndex) => (
                <option key={setIndex} value={setIndex}>
                  セット {setIndex}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="play-list-rally-result-filter">ラリー結果</label>
            <select
              id="play-list-rally-result-filter"
              value={rallyResultFilter}
              onChange={(event) =>
                setRallyResultFilter(event.target.value as RallyResultFilter)
              }
            >
              <option value="all">すべてのラリー</option>
              <option value="scored">得点ラリー</option>
              <option value="conceded">失点ラリー</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="play-list-min-plays">最小プレイ数</label>
            <input
              id="play-list-min-plays"
              type="number"
              min={1}
              max={99}
              value={minPlayCount}
              onChange={(event) =>
                setMinPlayCount(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
              }
            />
          </div>
        </div>

        <div className="list">
          {rallyItems.length === 0 ? (
            <div className="list-item">
              <strong>解析結果なし</strong>
              <p className="muted">
                API と接続すると、ここに `.vsm` / `.vsdb` から抽出したプレイが表示されます。
              </p>
            </div>
          ) : (
            rallyItems.map((rally, index) => {
              const firstPlay = rally.plays[0]?.play;
              const firstSeekSeconds = rally.plays[0]?.seekSeconds;
              const isExpanded = expandedRallies[rally.key] ?? false;
              const hasSelectedPlay = rally.plays.some((item) => item.key === selectedPlayKey);
              const rallyResultClass = getRallyResultClass(rally.point);
              const rallyNumber = getRallyNumber(rally.score);

              return (
                <article
                  className={`list-item${rallyResultClass}${hasSelectedPlay ? " list-item-active" : ""}`}
                  key={rally.key}
                >
                  <div className="list-item-header">
                    <div className="play-list-title">
                      <strong>
                        ラリー{rallyNumber}
                      </strong>
                      <span>{rally.plays.length}プレイ</span>
                    </div>
                    <small className="mono">{formatSeconds(rally.firstSeekSeconds ?? firstSeekSeconds)}</small>
                  </div>
                  <div className="play-list-meta">
                    <small>
                      スコア {rally.score.home} - {rally.score.away}
                    </small>
                    <small>自チーム {rally.homeRotation}</small>
                    <small>相手チーム {rally.awayRotation}</small>
                  </div>
                  <div className="tag-row play-list-tags">
                    <button
                      className="tag play-list-jump play-list-play-button"
                      type="button"
                      aria-label="このプレイに移動"
                      title="このプレイに移動"
                      onClick={() => {
                        if (!firstPlay) {
                          return;
                        }

                        onSelectPlay(
                          {
                            ...firstPlay,
                            setIndex: rally.setIndex,
                          },
                          rally.plays[0].key,
                        );
                      }}
                    >
                      ▶
                    </button>
                    <button
                      className="tag play-list-jump"
                      type="button"
                      onClick={() =>
                        setExpandedRallies((current) => ({
                          ...current,
                          [rally.key]: !isExpanded,
                        }))
                      }
                    >
                      {isExpanded ? "詳細を隠す" : "詳細を表示"}
                    </button>
                    <button
                      className="tag play-list-jump"
                      type="button"
                      onClick={() => playRallyFrom(index)}
                    >
                      ここから連続再生
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="play-rally-detail-list">
                      {rally.plays.map((item) => (
                        <div
                          className={`play-rally-detail${selectedPlayKey === item.key ? " play-rally-detail-active" : ""}`}
                          key={item.key}
                        >
                          <div className="play-rally-detail-row">
                            <div className="play-list-title">
                              <strong>{getSkillLabel(item.play.skill)}</strong>
                              <span>{item.play.player ?? "不明な選手"}</span>
                              <span>{getEffectGrade(item.play.effect)}</span>
                            </div>
                            <small className="mono">
                              {formatSeconds(item.seekSeconds)}
                            </small>
                          </div>
                          <div className="tag-row play-list-tags">
                            <button
                              className="tag play-list-jump play-list-play-button"
                              type="button"
                              aria-label="このプレイに移動"
                              title="このプレイに移動"
                              onClick={() =>
                                onSelectPlay(
                                  {
                                    ...item.play,
                                    setIndex: rally.setIndex,
                                  },
                                  item.key,
                                )
                              }
                            >
                              ▶
                            </button>
                            <span className="tag">
                              {getTeamLabel(item.play.team, match)}
                            </span>
                            {showPlayCodes ? (
                              <span className="tag mono">{item.play.code || "なし"}</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
