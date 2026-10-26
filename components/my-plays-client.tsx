"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MyStatsPanel, type MyStats } from "@/components/my-stats-panel";
import { VideoPlayer } from "@/components/video-player";
import { getSkillLabel } from "@/lib/domain/display";
import {
  MY_PLAY_SKILLS,
  buildMyClips,
  countMySkills,
  type MyClip,
  type MyPlaysMode,
} from "@/lib/domain/my-plays";
import { matchesStatFilter, type StatFilter } from "@/lib/domain/my-stats";
import type { ParsedMatch, ParsedPlay, TeamSide, VideoSyncSettings } from "@/lib/domain/types";
import { formatSeconds } from "@/lib/domain/video";

type MyPlaysClientProps = {
  basePath: string;
  options: { workspaceId: string; label: string }[];
  selectedId: string;
  isLatest: boolean;
  match: ParsedMatch;
  settings: VideoSyncSettings;
  side: TeamSide;
  number: string;
  opponent: string;
  setScore: { own: number; opponent: number };
  stats: MyStats;
  // この試合の振り返りのノートを書くページ(ノートを書けない人は null)。
  noteHref: string | null;
  // 試合を選ぶリンクの頭(「/t/utvb/myplays?」か、ほかの部員を見ているときは「…?member=ID&」)。
  linkBase: string;
  isSelf: boolean;
};

const MODE_LABELS: Record<MyPlaysMode, string> = { skill: "スキルだけ", rally: "ラリー全体" };

/**
 * 自分のプレーの映像。見方は2つ(試合ビューアと同じ):スキルだけ(触った瞬間の前後)と、ラリー全体。
 * スキルで絞って、続けて再生できる。続けて再生の進め方は、試合ビューアのクリップと同じ(再生位置を見て次へ)。
 */
export function MyPlaysClient({
  basePath,
  options,
  selectedId,
  isLatest,
  match,
  settings,
  side,
  number,
  opponent,
  setScore,
  stats,
  noteHref,
  linkBase,
  isSelf,
}: MyPlaysClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<MyPlaysMode>("skill");
  const [skill, setSkill] = useState<string | null>(null);
  const [selectedPlay, setSelectedPlay] = useState<ParsedPlay>();
  const [selectedKey, setSelectedKey] = useState<string>();
  const [playerSeconds, setPlayerSeconds] = useState<number>();
  const [pauseToken, setPauseToken] = useState<number>();
  const [activeIndex, setActiveIndex] = useState<number>();
  const [activeReady, setActiveReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // 成績の数字を押したときの絞り込み(「アタック 決定率」など)。スキルのボタンとは、どちらか一方。
  const [focus, setFocus] = useState<{ filter: StatFilter; label: string; key: string } | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  const skillCounts = useMemo(() => countMySkills(match, side, number), [match, side, number]);
  const clips = useMemo(
    () =>
      buildMyClips({
        match,
        settings,
        side,
        number,
        mode,
        skills: skill ? [skill] : undefined,
        where: focus ? (play) => matchesStatFilter(play, focus.filter) : undefined,
      }),
    [match, settings, side, number, mode, skill, focus],
  );
  const clipsKey = clips.map((clip) => clip.key).join("|");

  const onPlayerTimeChange = useCallback((seconds: number | undefined) => setPlayerSeconds(seconds), []);
  const pause = useCallback(() => setPauseToken((value) => (value ?? 0) + 1), []);

  const select = useCallback((clip: MyClip) => {
    setSelectedKey(clip.key);
    // 同じ切り取りをもう一度押しても頭に戻るよう、毎回新しいものを渡す。
    setSelectedPlay({ ...clip.startPlay });
  }, []);

  function playFrom(index: number) {
    const clip = clips[index];
    if (!clip) {
      return;
    }
    setActiveIndex(index);
    setActiveReady(false);
    setIsPlaying(true);
    select(clip);
  }

  const stop = useCallback(() => {
    setIsPlaying(false);
    setActiveIndex(undefined);
    setActiveReady(false);
    pause();
  }, [pause]);

  // 見方・絞り込みを変えたら、続けて再生は止める。
  useEffect(() => {
    setIsPlaying(false);
    setActiveIndex(undefined);
    setActiveReady(false);
  }, [clipsKey]);

  // 成績の数字を押したときは、絞ったものを頭から続けて流す(上の止める処理のあとに動く)。
  useEffect(() => {
    if (!focus || clips.length === 0) {
      return;
    }
    setActiveIndex(0);
    setActiveReady(false);
    setIsPlaying(true);
    select(clips[0]);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps -- 押したときだけ

  function focusOn(filter: StatFilter, label: string, key: string) {
    if (focus?.key === key) {
      setFocus(null);
      return;
    }
    setSkill(null);
    setFocus({ filter, label, key });
    videoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (!isPlaying || typeof activeIndex !== "number" || typeof playerSeconds !== "number") {
      return;
    }
    const active = clips[activeIndex];
    if (!active) {
      return;
    }
    const end = active.seekSeconds + active.durationSeconds;
    if (!activeReady) {
      if (playerSeconds >= active.seekSeconds - 0.2 && playerSeconds < end) {
        setActiveReady(true);
      }
      return;
    }
    if (playerSeconds < end - 0.15) {
      return;
    }
    const next = activeIndex + 1;
    if (next >= clips.length) {
      stop();
      return;
    }
    setActiveIndex(next);
    setActiveReady(false);
    select(clips[next]);
  }, [activeIndex, activeReady, clips, isPlaying, playerSeconds, select, stop]);

  const playButton = (
    <button
      className={`button clip-player-action${isPlaying ? " secondary" : ""}`}
      type="button"
      disabled={clips.length === 0}
      onClick={() => (isPlaying ? stop() : playFrom(activeIndex ?? 0))}
    >
      <span aria-hidden="true">{isPlaying ? "■" : "▶"}</span>
      <span>{isPlaying ? "停止" : "続けて再生"}</span>
    </button>
  );

  const presentSkills = MY_PLAY_SKILLS.filter((code) => skillCounts[code]);

  return (
    <section className="tp-section tp-myplays">
      <div className="tp-myplays-head">
        <label className="tp-field tp-myplays-match">
          <span className="tp-label">{isLatest ? "直近の試合" : "試合"}</span>
          <select
            value={selectedId}
            onChange={(event) => router.push(`${linkBase}match=${encodeURIComponent(event.target.value)}`)}
          >
            {options.map((option) => (
              <option key={option.workspaceId} value={option.workspaceId}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="tp-small">
          vs {opponent} <b>{setScore.own}-{setScore.opponent}</b>({setScore.own > setScore.opponent ? "勝ち" : setScore.own < setScore.opponent ? "負け" : "引き分け"})・背番号 {number}
        </p>
      </div>

      <div className="tp-myplays-controls">
        <span className="tp-seg" role="group" aria-label="見方">
          {(Object.keys(MODE_LABELS) as MyPlaysMode[]).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>
              {MODE_LABELS[value]}
            </button>
          ))}
        </span>
        <div className="tp-chips" role="group" aria-label="スキルで絞る">
          <button
            type="button"
            className="tp-chip"
            aria-pressed={skill === null && !focus}
            onClick={() => {
              setSkill(null);
              setFocus(null);
            }}
          >
            すべて
          </button>
          {presentSkills.map((code) => (
            <button
              key={code}
              type="button"
              className="tp-chip"
              aria-pressed={skill === code}
              onClick={() => {
                setFocus(null);
                setSkill(skill === code ? null : code);
              }}
            >
              {getSkillLabel(code)} {skillCounts[code]}
            </button>
          ))}
        </div>
      </div>

      {focus ? (
        <p className="tp-myplays-focus">
          絞り込み中:<b>{focus.label}</b>({clips.length}件)
          <button type="button" className="tp-clear" onClick={() => setFocus(null)}>
            解除
          </button>
        </p>
      ) : null}

      <div ref={videoRef} className="tp-myplays-video">
      <VideoPlayer
        match={match}
        settings={settings}
        selectedPlay={selectedPlay}
        pauseToken={pauseToken}
        headerAction={playButton}
        onPlayerTimeChange={onPlayerTimeChange}
      />
      </div>

      <MyStatsPanel stats={stats} linkBase={linkBase} isSelf={isSelf} focusKey={focus?.key ?? null} onFocus={focusOn} />

      {noteHref ? (
        <a className="tp-button tp-myplays-note" href={noteHref}>
          この試合の振り返りをノートに書く
        </a>
      ) : null}

      <h2 className="tp-myplays-listhead">プレー一覧</h2>

      {clips.length === 0 ? (
        <p className="tp-small tp-muted">
          映像に合わせられるプレーがありません(この試合に動画が設定されていないか、時刻のないデータです)。
        </p>
      ) : (
        <ol className="tp-myplays-list">
          {clips.map((clip, index) => (
            <li
              key={clip.key}
              data-won={clip.won === null ? undefined : String(clip.won)}
              aria-current={clip.key === selectedKey ? "true" : undefined}
            >
              <button type="button" onClick={() => playFrom(index)} aria-label="ここから再生">
                ▶
              </button>
              <span className="tp-myplays-set">第{clip.setIndex}セット</span>
              <span className="tp-myplays-score">
                {clip.score.own}-{clip.score.opponent}
              </span>
              <span className="tp-myplays-skills">
                {clip.plays.map((play, playIndex) => (
                  <span key={playIndex} className="tp-myplays-skill" data-grade={play.grade}>
                    {play.skillLabel} <b>{play.grade}</b>
                  </span>
                ))}
              </span>
              <small className="tp-muted">{formatSeconds(clip.seekSeconds)}</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
