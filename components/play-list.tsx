"use client";

import { useState } from "react";
import { getEffectGrade, getSkillLabel, getTeamLabel } from "@/lib/domain/display";
import { getRotationLabel } from "@/lib/domain/rotation";
import { calculateSeekSeconds, formatSeconds } from "@/lib/domain/video";
import type { ParsedMatch, ParsedPlay, VideoSyncSettings } from "@/lib/domain/types";

type PlayListProps = {
  match?: ParsedMatch;
  settings: VideoSyncSettings;
  selectedPlayId?: string;
  selectedSetIndex?: number;
  onSelectedSetIndexChange: (setIndex: number) => void;
  onSelectPlay: (play: ParsedPlay) => void;
};

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
  settings,
  selectedPlayId,
  selectedSetIndex,
  onSelectedSetIndexChange,
  onSelectPlay,
}: PlayListProps) {
  const [expandedRallies, setExpandedRallies] = useState<Record<string, boolean>>({});
  const [showPlayCodes, setShowPlayCodes] = useState(false);

  const availableSetIndices = match?.sets.map((set) => set.setIndex) ?? [];
  const effectiveSetIndex =
    selectedSetIndex ??
    match?.sets.find((set) =>
      set.events.some((event) => event.plays.some((play) => play.id === selectedPlayId)),
    )?.setIndex ??
    availableSetIndices[0];

  const rallyItems =
    match?.sets.flatMap((set) =>
      typeof effectiveSetIndex === "number" && set.setIndex !== effectiveSetIndex
        ? []
        :
      set.events.flatMap((event) =>
        event.plays.length === 0
          ? []
          : [
              {
                key: `${set.id}-${event.id}`,
                setIndex: set.setIndex,
                eventIndex: event.eventIndex,
                point: event.point,
                score: getScoreBeforeRally(event.score, event.point),
                homeRotation: getRotationLabel(event.lineup.home),
                awayRotation: getRotationLabel(event.lineup.away),
                plays: event.plays.map((play, index) => ({
                  key: `${set.id}-${event.id}-${play.id}-${index}`,
                  play,
                  seekSeconds: calculateSeekSeconds(play, settings, match),
                })),
              },
            ],
      ),
    ) ?? [];

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div className="play-list-header">
          <h2>プレイ一覧</h2>
          <button
            className={`button${showPlayCodes ? "" : " secondary"}`}
            type="button"
            aria-pressed={showPlayCodes}
            onClick={() => setShowPlayCodes((current) => !current)}
          >
            {showPlayCodes ? "打ち込みコードを隠す" : "打ち込みコードを表示"}
          </button>
        </div>

        {availableSetIndices.length > 1 ? (
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
        ) : null}

        <div className="list">
          {rallyItems.length === 0 ? (
            <div className="list-item">
              <strong>解析結果なし</strong>
              <p className="muted">
                API と接続すると、ここに `.vsm` / `.vsdb` から抽出したプレイが表示されます。
              </p>
            </div>
          ) : (
            rallyItems.map((rally) => {
              const firstPlay = rally.plays[0]?.play;
              const firstSeekSeconds = rally.plays[0]?.seekSeconds;
              const isExpanded = expandedRallies[rally.key] ?? false;
              const hasSelectedPlay = rally.plays.some(
                (item) => item.play.id === selectedPlayId,
              );
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
                    <small className="mono">{formatSeconds(firstSeekSeconds)}</small>
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
                      className="tag play-list-jump"
                      type="button"
                      onClick={() => {
                        if (!firstPlay) {
                          return;
                        }

                        onSelectPlay({
                          ...firstPlay,
                          setIndex: rally.setIndex,
                        });
                      }}
                    >
                      このプレイに移動
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
                  </div>

                  {isExpanded ? (
                    <div className="play-rally-detail-list">
                      {rally.plays.map((item) => (
                        <div
                          className={`play-rally-detail${selectedPlayId === item.play.id ? " play-rally-detail-active" : ""}`}
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
                            <span className="tag">
                              チーム: {getTeamLabel(item.play.team, match)}
                            </span>
                            {showPlayCodes ? (
                              <span className="tag mono">
                                打ち込みコード: {item.play.code || "なし"}
                              </span>
                            ) : null}
                            <button
                              className="tag play-list-jump"
                              type="button"
                              onClick={() =>
                                onSelectPlay({
                                  ...item.play,
                                  setIndex: rally.setIndex,
                                })
                              }
                            >
                              このプレイに移動
                            </button>
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
