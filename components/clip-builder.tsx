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

const gradeOptions = ["A", "B", "C", "D", "E", "F"] as const;
type GradeOption = (typeof gradeOptions)[number];

const attackTypeOptions = [
  { value: "P1", label: "P1 レフトハイセット" },
  { value: "PV", label: "PV レフト平行" },
  { value: "P2", label: "P2 レフトハイセット" },
  { value: "PB", label: "PB Bクイック" },
  { value: "PW", label: "PW レフトセミ" },
  { value: "PA", label: "PA Aクイック" },
  { value: "PX", label: "PX セミ" },
  { value: "P3", label: "P3 センターオープン" },
  { value: "P8", label: "P8 パイプ" },
  { value: "PC", label: "PC Cクイック" },
  { value: "PY", label: "PY ライトセミ" },
  { value: "P4", label: "P4 ライトハイセット" },
  { value: "P5", label: "P5 ライトハイセット" },
  { value: "PZ", label: "PZ ライト平行" },
  { value: "P9", label: "P9 シャー" },
] as const;

const blockZoneOptions = [
  { value: "ゾーン1", label: "ゾーン1" },
  { value: "ゾーン2", label: "ゾーン2" },
  { value: "ゾーン3", label: "ゾーン3" },
  { value: "ゾーン4", label: "ゾーン4" },
  { value: "ゾーン5", label: "ゾーン5" },
  { value: "その他", label: "その他" },
] as const;

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
};

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function normalizePlayerNumber(value: string | undefined) {
  if (!value) {
    return "";
  }

  return value.trim().replace(/^0+/, "") || "0";
}

function getGradeMatches(effect: string | undefined, selectedGrades: GradeOption[]) {
  const grade = getEffectGrade(effect);
  return selectedGrades.includes(grade as GradeOption);
}

function getAttackCombination(play: ParsedPlay | undefined) {
  const combination = play?.combination?.trim().toUpperCase();
  if (combination?.match(/^P[A-Z0-9]$/)) {
    return combination;
  }

  const code = play?.code?.trim().toUpperCase();
  const codeMatch = code?.match(/P[A-Z0-9]/);
  if (codeMatch) {
    return codeMatch[0];
  }

  return undefined;
}

function findNextTeamAttack(
  plays: ParsedPlay[],
  playIndex: number,
  teamCode: string,
) {
  return plays
    .slice(playIndex + 1)
    .find((candidate) => candidate.team === teamCode && candidate.skill === "A");
}

function findPreviousOpponentAttack(
  plays: ParsedPlay[],
  playIndex: number,
  opponentCode: string,
) {
  return [...plays.slice(0, playIndex)]
    .reverse()
    .find((candidate) => candidate.team === opponentCode && candidate.skill === "A");
}

function getAttackTypeForPlay(
  play: ParsedPlay,
  plays: ParsedPlay[],
  playIndex: number,
) {
  if (play.skill === "A") {
    return getAttackCombination(play);
  }
  if (play.skill === "E") {
    return getAttackCombination(play) ?? getAttackCombination(findNextTeamAttack(plays, playIndex, play.team));
  }
  return undefined;
}

function getBlockZoneForCombination(combination: string | undefined) {
  switch (combination) {
    case "P1":
    case "PV":
      return "ゾーン1";
    case "P2":
    case "PB":
    case "PW":
      return "ゾーン2";
    case "PA":
    case "PX":
    case "P3":
    case "P8":
      return "ゾーン3";
    case "PC":
    case "PY":
    case "P4":
      return "ゾーン4";
    case "P5":
    case "PZ":
    case "P9":
      return "ゾーン5";
    default:
      return "その他";
  }
}

function getBlockZoneForPlay(
  play: ParsedPlay,
  plays: ParsedPlay[],
  playIndex: number,
) {
  if (play.skill !== "B") {
    return undefined;
  }
  const opponentCode = play.team === "*" ? "a" : "*";
  const attack = findPreviousOpponentAttack(plays, playIndex, opponentCode);
  return getBlockZoneForCombination(getAttackCombination(attack));
}

function isSkillSelection(skill: string, expectedSkill: "A" | "B") {
  return skill === expectedSkill || getSkillLabel(skill) === getSkillLabel(expectedSkill);
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
  const [attackTypeFilter, setAttackTypeFilter] = useState("all");
  const [blockZoneFilter, setBlockZoneFilter] = useState("all");
  const [selectedGrades, setSelectedGrades] = useState<GradeOption[]>([...gradeOptions]);
  const [clipBeforeSeconds, setClipBeforeSeconds] = useState(2);
  const [clipAfterSeconds, setClipAfterSeconds] = useState(5);
  const [clipBeforeSecondsInput, setClipBeforeSecondsInput] = useState("2");
  const [clipAfterSecondsInput, setClipAfterSecondsInput] = useState("5");
  const [activeClipIndex, setActiveClipIndex] = useState<number>();
  const [activeClipReady, setActiveClipReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayCodes, setShowPlayCodes] = useState(false);
  const canEditAttackTypeFilter = isSkillSelection(skillFilter, "A");
  const canEditBlockZoneFilter = isSkillSelection(skillFilter, "B");

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
            players.add(normalizePlayerNumber(play.player));
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
          if (
            playerFilter !== "all" &&
            normalizePlayerNumber(play.player) !== playerFilter
          ) {
            return [];
          }
          if (skillFilter !== "all" && play.skill !== skillFilter) {
            return [];
          }
          if (
            attackTypeFilter !== "all" &&
            getAttackTypeForPlay(play, event.plays, playIndex) !== attackTypeFilter
          ) {
            return [];
          }
          if (
            blockZoneFilter !== "all" &&
            getBlockZoneForPlay(play, event.plays, playIndex) !== blockZoneFilter
          ) {
            return [];
          }
          if (!getGradeMatches(play.effect, selectedGrades)) {
            return [];
          }
          if (typeof seekSeconds !== "number") {
            return [];
          }
          const clipStartSeconds = Math.max(0, seekSeconds - clipBeforeSeconds);
          const clipEndSeconds = seekSeconds + clipAfterSeconds;
          const durationSeconds = Math.max(1, clipEndSeconds - clipStartSeconds);
          const clipPlay =
            typeof play.time === "number"
              ? {
                  ...play,
                  setIndex: set.setIndex,
                  time: Math.max(0, play.time - clipBeforeSeconds * 10),
                }
              : {
                  ...play,
                  setIndex: set.setIndex,
                };

          return [
            {
              key: `${set.id}-${event.id}-${play.id}-${playIndex}`,
              play: clipPlay,
              title: getSkillLabel(play.skill),
              subtitle: `${play.player ?? "不明な選手"} / ${getEffectGrade(play.effect)}`,
              setIndex: set.setIndex,
              eventIndex: event.eventIndex,
              score: event.score,
              point: event.point,
              seekSeconds: clipStartSeconds,
              durationSeconds,
            },
          ];
        });
      }),
    );
  }, [
    clipAfterSeconds,
    clipBeforeSeconds,
    match,
    attackTypeFilter,
    blockZoneFilter,
    playerFilter,
    selectedGrades,
    settings,
    skillFilter,
    teamFilter,
  ]);

  const totalClipSeconds = clips.reduce(
    (sum, clip) => sum + clip.durationSeconds,
    0,
  );

  const clipsKey = clips
    .map((clip) => `${clip.key}:${clip.seekSeconds}:${clip.durationSeconds}`)
    .join("|");

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
              onChange={(event) => {
                const nextSkill = event.target.value;
                setSkillFilter(nextSkill);
                if (!isSkillSelection(nextSkill, "A")) {
                  setAttackTypeFilter("all");
                }
                if (!isSkillSelection(nextSkill, "B")) {
                  setBlockZoneFilter("all");
                }
              }}
              >
              <option value="all">すべてのスキル</option>
              {options.skills.map((skill) => (
                <option key={skill} value={skill}>
                  {getSkillLabel(skill)}
                </option>
              ))}
            </select>
          </div>

          <div className={canEditAttackTypeFilter ? "field" : "field field-disabled"}>
            <label htmlFor="clip-attack-type-filter">アタック種類</label>
            <select
              id="clip-attack-type-filter"
              value={attackTypeFilter}
              disabled={!canEditAttackTypeFilter}
              aria-disabled={!canEditAttackTypeFilter}
              onChange={(event) => setAttackTypeFilter(event.target.value)}
            >
              <option value="all">すべての種類</option>
              {attackTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={canEditBlockZoneFilter ? "field" : "field field-disabled"}>
            <label htmlFor="clip-block-zone-filter">ブロックゾーン</label>
            <select
              id="clip-block-zone-filter"
              value={blockZoneFilter}
              disabled={!canEditBlockZoneFilter}
              aria-disabled={!canEditBlockZoneFilter}
              onChange={(event) => setBlockZoneFilter(event.target.value)}
            >
              <option value="all">すべてのゾーン</option>
              {blockZoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <span className="field-label">評価</span>
            <div className="tag-row clip-grade-checks" aria-label="評価フィルター">
              {gradeOptions.map((grade) => (
                <label className="check-field clip-grade-check" key={grade}>
                  <input
                    type="checkbox"
                    checked={selectedGrades.includes(grade)}
                    onChange={(event) =>
                      setSelectedGrades((current) =>
                        event.target.checked
                          ? [...current, grade].sort()
                          : current.filter((value) => value !== grade),
                      )
                    }
                  />
                  <span>{grade}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="clip-before-seconds">前秒数</label>
            <input
              id="clip-before-seconds"
              type="number"
              min={0}
              max={30}
              value={clipBeforeSecondsInput}
              onChange={(event) => setClipBeforeSecondsInput(event.target.value)}
              onBlur={() => {
                const nextValue = clampNumber(Number(clipBeforeSecondsInput), 0, 30, 2);
                setClipBeforeSeconds(nextValue);
                setClipBeforeSecondsInput(String(nextValue));
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="clip-after-seconds">後秒数</label>
            <input
              id="clip-after-seconds"
              type="number"
              min={1}
              max={60}
              value={clipAfterSecondsInput}
              onChange={(event) => setClipAfterSecondsInput(event.target.value)}
              onBlur={() => {
                const nextValue = clampNumber(Number(clipAfterSecondsInput), 1, 60, 5);
                setClipAfterSeconds(nextValue);
                setClipAfterSecondsInput(String(nextValue));
              }}
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
                  <small>チーム {getTeamLabel(clip.play.team, match)}</small>
                </div>
                <div className="tag-row play-list-tags">
                  {showPlayCodes ? (
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
