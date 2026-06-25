"use client";

import { useEffect, useMemo, useState } from "react";
import { getEffectGrade, getSkillLabel, getTeamLabel } from "@/lib/domain/display";
import { calculateSeekSeconds, formatSeconds } from "@/lib/domain/video";
import type { ParsedMatch, ParsedPlay, VideoSyncSettings } from "@/lib/domain/types";

type ClipBuilderProps = {
  match?: ParsedMatch;
  settings: VideoSyncSettings;
  currentPlayerSeconds?: number;
  selectedPlayId?: string;
  onSelectPlay: (play: ParsedPlay) => void;
  onPauseRequest: () => void;
};

type GradeFilter = "all" | "A" | "D_OR_LOWER" | "F";

type ClipCandidate = {
  key: string;
  play: ParsedPlay;
  title: string;
  subtitle: string;
  setIndex: number;
  eventIndex: number;
  score: {
    home: number;
    away: number;
  };
  point?: string;
  seekSeconds: number;
  durationSeconds: number;
  concededTeamLabel?: string;
};

const RALLY_TAIL_SECONDS = 3;

function getGradeMatches(effect: string | undefined, gradeFilter: GradeFilter) {
  if (gradeFilter === "all") {
    return true;
  }

  const grade = getEffectGrade(effect);
  if (gradeFilter === "A") {
    return grade === "A";
  }

  if (gradeFilter === "F") {
    return grade === "F";
  }

  return grade === "D" || grade === "E" || grade === "F";
}

function getConcededTeamCode(point?: string) {
  if (point === "*") {
    return "a";
  }

  if (point === "a") {
    return "*";
  }

  return undefined;
}

export function ClipBuilder({
  match,
  settings,
  currentPlayerSeconds,
  selectedPlayId,
  onSelectPlay,
  onPauseRequest,
}: ClipBuilderProps) {
  const [teamFilter, setTeamFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [concededOnly, setConcededOnly] = useState(false);
  const [concededMinPlayCount, setConcededMinPlayCount] = useState(1);
  const [clipSeconds, setClipSeconds] = useState(8);
  const [activeClipIndex, setActiveClipIndex] = useState<number>();
  const [activeClipReady, setActiveClipReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayCodes, setShowPlayCodes] = useState(false);

  const options = useMemo(() => {
    const teams = new Set<string>();
    const players = new Set<string>();
    const skills = new Set<string>();

    match?.sets.forEach((set) => {
      set.events.forEach((event) => {
        event.plays.forEach((play) => {
          const teamLabel = getTeamLabel(play.team, match);
          if (play.team) {
            teams.add(teamLabel);
          }
          if (play.player && (teamFilter === "all" || teamLabel === teamFilter)) {
            players.add(play.player);
          }
          if (play.skill) {
            skills.add(play.skill);
          }
        });
      });
    });

    return {
      teams: [...teams].sort(),
      players: [...players].sort(),
      skills: [...skills].sort(),
    };
  }, [match, teamFilter]);

  const clips = useMemo<ClipCandidate[]>(() => {
    if (!match) {
      return [];
    }

    return match.sets.flatMap((set) =>
      set.events.flatMap((event) => {
        const concededTeamCode = getConcededTeamCode(event.point);
        const concededTeamLabel = getTeamLabel(concededTeamCode, match);

        if (concededOnly) {
          if (!concededTeamCode || event.plays.length === 0) {
            return [];
          }
          if (event.plays.length < concededMinPlayCount) {
            return [];
          }
          if (teamFilter !== "all" && concededTeamLabel !== teamFilter) {
            return [];
          }

          const timedPlays = event.plays
            .map((play, playIndex) => {
              const seekSeconds = calculateSeekSeconds(
                {
                  ...play,
                  setIndex: set.setIndex,
                },
                settings,
                match,
              );

              return typeof seekSeconds === "number"
                ? {
                    play,
                    playIndex,
                    seekSeconds,
                  }
                : undefined;
            })
            .filter((entry): entry is {
              play: ParsedPlay;
              playIndex: number;
              seekSeconds: number;
            } => Boolean(entry))
            .sort((left, right) => left.seekSeconds - right.seekSeconds);

          const firstTimedPlay = timedPlays[0];
          const lastTimedPlay = timedPlays.at(-1);
          if (!firstTimedPlay || !lastTimedPlay) {
            return [];
          }

          return [
            {
              key: `${set.id}-${event.id}-conceded-rally`,
              play: {
                ...firstTimedPlay.play,
                setIndex: set.setIndex,
              },
              title: "失点ラリー",
              subtitle: `${event.plays.length}プレイ`,
              setIndex: set.setIndex,
              eventIndex: event.eventIndex,
              score: event.score,
              point: event.point,
              seekSeconds: firstTimedPlay.seekSeconds,
              durationSeconds: Math.max(
                RALLY_TAIL_SECONDS,
                lastTimedPlay.seekSeconds - firstTimedPlay.seekSeconds + RALLY_TAIL_SECONDS,
              ),
              concededTeamLabel,
            },
          ];
        }

        return event.plays.flatMap((play, playIndex) => {
          const teamLabel = getTeamLabel(play.team, match);
          const seekSeconds = calculateSeekSeconds(
            {
              ...play,
              setIndex: set.setIndex,
            },
            settings,
            match,
          );

          if (teamFilter !== "all" && teamLabel !== teamFilter) {
            return [];
          }
          if (playerFilter !== "all" && play.player !== playerFilter) {
            return [];
          }
          if (skillFilter !== "all" && play.skill !== skillFilter) {
            return [];
          }
          if (!getGradeMatches(play.effect, gradeFilter)) {
            return [];
          }
          if (typeof seekSeconds !== "number") {
            return [];
          }

          return [
            {
              key: `${set.id}-${event.id}-${play.id}-${playIndex}`,
              play: {
                ...play,
                setIndex: set.setIndex,
              },
              title: getSkillLabel(play.skill),
              subtitle: `${play.player ?? "不明な選手"} / ${getEffectGrade(play.effect)}`,
              setIndex: set.setIndex,
              eventIndex: event.eventIndex,
              score: event.score,
              point: event.point,
              seekSeconds,
              durationSeconds: clipSeconds,
            },
          ];
        });
      }),
    );
  }, [
    clipSeconds,
    concededMinPlayCount,
    concededOnly,
    gradeFilter,
    match,
    playerFilter,
    settings,
    skillFilter,
    teamFilter,
  ]);

  const totalClipSeconds = clips.reduce(
    (sum, clip) => sum + clip.durationSeconds,
    0,
  );

  const clipsKey = clips.map((clip) => clip.key).join("|");

  useEffect(() => {
    setActiveClipIndex(undefined);
    setActiveClipReady(false);
    setIsPlaying(false);
    onPauseRequest();
  }, [clipsKey, onPauseRequest]);

  useEffect(() => {
    if (!isPlaying || typeof activeClipIndex !== "number") {
      return;
    }

    const activeClip = clips[activeClipIndex];
    if (!activeClip || typeof currentPlayerSeconds !== "number") {
      return;
    }

    const clipEndSeconds = activeClip.seekSeconds + activeClip.durationSeconds;
    if (!activeClipReady) {
      if (
        currentPlayerSeconds >= activeClip.seekSeconds - 0.2 &&
        currentPlayerSeconds < clipEndSeconds
      ) {
        setActiveClipReady(true);
      }
      return;
    }

    if (currentPlayerSeconds < clipEndSeconds - 0.15) {
      return;
    }

    const nextIndex = activeClipIndex + 1;
    if (nextIndex >= clips.length) {
      setIsPlaying(false);
      setActiveClipIndex(undefined);
      setActiveClipReady(false);
      onPauseRequest();
      return;
    }

    setActiveClipIndex(nextIndex);
    setActiveClipReady(false);
    onSelectPlay(clips[nextIndex].play);
  }, [
    activeClipIndex,
    activeClipReady,
    clips,
    currentPlayerSeconds,
    isPlaying,
    onPauseRequest,
    onSelectPlay,
  ]);

  function playFrom(index: number) {
    const clip = clips[index];
    if (!clip) {
      return;
    }

    setActiveClipIndex(index);
    setActiveClipReady(false);
    setIsPlaying(true);
    onSelectPlay(clip.play);
  }

  function stopPlayback() {
    setIsPlaying(false);
    setActiveClipIndex(undefined);
    setActiveClipReady(false);
    onPauseRequest();
  }

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div className="clip-builder-header">
          <div>
            <h2>クリップ抽出</h2>
            <p className="muted">
              {clips.length}件 / {Math.round(totalClipSeconds)}秒
            </p>
          </div>
          <div className="button-row">
            <button
              className={`button${showPlayCodes ? "" : " secondary"}`}
              type="button"
              aria-pressed={showPlayCodes}
              onClick={() => setShowPlayCodes((current) => !current)}
            >
              {showPlayCodes ? "コードを隠す" : "コードを表示"}
            </button>
            <button
              className="button"
              type="button"
              disabled={clips.length === 0}
              onClick={() => playFrom(activeClipIndex ?? 0)}
            >
              {isPlaying ? "再開" : "連続再生"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!isPlaying}
              onClick={stopPlayback}
            >
              停止
            </button>
          </div>
        </div>

        <div className="clip-filter-grid">
          <div className="field">
            <label htmlFor="clip-team-filter">チーム</label>
            <select
              id="clip-team-filter"
              value={teamFilter}
              onChange={(event) => {
                setTeamFilter(event.target.value);
                setPlayerFilter("all");
              }}
            >
              <option value="all">すべてのチーム</option>
              {options.teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="clip-player-filter">選手</label>
            <select
              id="clip-player-filter"
              value={playerFilter}
              disabled={concededOnly}
              onChange={(event) => setPlayerFilter(event.target.value)}
            >
              <option value="all">すべての選手</option>
              {options.players.map((player) => (
                <option key={player} value={player}>
                  {player}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="clip-skill-filter">スキル</label>
            <select
              id="clip-skill-filter"
              value={skillFilter}
              disabled={concededOnly}
              onChange={(event) => setSkillFilter(event.target.value)}
            >
              <option value="all">すべてのスキル</option>
              {options.skills.map((skill) => (
                <option key={skill} value={skill}>
                  {getSkillLabel(skill)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="clip-grade-filter">評価</label>
            <select
              id="clip-grade-filter"
              value={gradeFilter}
              disabled={concededOnly}
              onChange={(event) => setGradeFilter(event.target.value as GradeFilter)}
            >
              <option value="all">すべての評価</option>
              <option value="A">A評価</option>
              <option value="D_OR_LOWER">D評価以下</option>
              <option value="F">Fのみ</option>
            </select>
          </div>

          <label className="check-field" htmlFor="clip-conceded-filter">
            <input
              id="clip-conceded-filter"
              type="checkbox"
              checked={concededOnly}
              onChange={(event) => setConcededOnly(event.target.checked)}
            />
            <span>失点のみ</span>
          </label>

          <div className="field">
            <label htmlFor="clip-conceded-min-plays">失点ラリーの最小プレイ数</label>
            <input
              id="clip-conceded-min-plays"
              type="number"
              min={1}
              max={99}
              value={concededMinPlayCount}
              disabled={!concededOnly}
              onChange={(event) =>
                setConcededMinPlayCount(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="clip-seconds">秒数</label>
            <input
              id="clip-seconds"
              type="number"
              min={3}
              max={30}
              value={clipSeconds}
              disabled={concededOnly}
              onChange={(event) =>
                setClipSeconds(Math.max(3, Math.min(30, Number(event.target.value) || 8)))
              }
            />
          </div>
        </div>

        <div className="clip-list">
          {clips.length === 0 ? (
            <div className="list-item">
              <strong>該当クリップなし</strong>
              <p className="muted">条件に一致する再生可能なプレイがありません。</p>
            </div>
          ) : (
            clips.map((clip, index) => (
              <article
                className={`list-item${activeClipIndex === index || selectedPlayId === clip.play.id ? " list-item-active" : ""}`}
                key={clip.key}
              >
                <div className="list-item-header">
                  <div className="play-list-title">
                    <strong>
                      {index + 1}. {clip.title}
                    </strong>
                    <span>{clip.subtitle}</span>
                  </div>
                  <small className="mono">
                    {formatSeconds(clip.seekSeconds)} / {Math.round(clip.durationSeconds)}秒
                  </small>
                </div>
                <div className="play-list-meta">
                  <small>セット {clip.setIndex}</small>
                  <small>ラリー {clip.eventIndex}</small>
                  <small>
                    スコア {clip.score.home} - {clip.score.away}
                  </small>
                  {clip.concededTeamLabel ? (
                    <small>失点 {clip.concededTeamLabel}</small>
                  ) : (
                    <small>チーム {getTeamLabel(clip.play.team, match)}</small>
                  )}
                </div>
                <div className="tag-row play-list-tags">
                  {showPlayCodes && !clip.concededTeamLabel ? (
                    <span className="tag mono">{clip.play.code || "なし"}</span>
                  ) : null}
                  <button
                    className="tag play-list-jump"
                    type="button"
                    onClick={() => playFrom(index)}
                  >
                    ここから再生
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
