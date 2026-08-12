"use client";

import { getRotationLabel, getSideLabel } from "@/lib/domain/rotation";
import { areTeamNamesEquivalent } from "@/lib/domain/team";
import {
  calculateSeekSeconds,
  extractYouTubeVideoId,
  formatSeconds,
  getVideoSourceForSet,
} from "@/lib/domain/video";
import type {
  MatchLineup,
  ParsedEvent,
  ParsedMatch,
  ParsedPlay,
  TeamSide,
  VideoSyncSettings,
} from "@/lib/domain/types";

type RotationLineupTabProps = {
  match?: ParsedMatch;
  ownTeamName?: string;
  settings: VideoSyncSettings;
};

const COURT_LAYOUT = [
  ["4", "3", "2"],
  ["5", "6", "1"],
];

const ROTATIONS = [1, 2, 3, 4, 5, 6];

function getTeamName(match: ParsedMatch, side: TeamSide) {
  return side === "home" ? match.teams.home.name : match.teams.away.name;
}

function getSideOrder(match: ParsedMatch, ownTeamName?: string): TeamSide[] {
  if (areTeamNamesEquivalent(match.teams.away.name, ownTeamName)) {
    return ["away", "home"];
  }

  return ["home", "away"];
}

function getTeamCode(side: TeamSide) {
  return side === "home" ? "*" : "a";
}

function getOpponentSide(side: TeamSide): TeamSide {
  return side === "home" ? "away" : "home";
}

function buildLineupsByRotation(match: ParsedMatch, side: TeamSide) {
  const lineups = new Map<
    number,
    {
      lineup: MatchLineup;
      event: ParsedEvent;
      receptionServe?: ParsedPlay;
      setIndex: number;
    }
  >();
  const opponentCode = getTeamCode(getOpponentSide(side));

  match.sets.forEach((set) => {
    set.events.forEach((event) => {
      const lineup = event.lineup[side];
      const setterAt = lineup.setterAt;
      if (!setterAt) {
        return;
      }

      const current =
        lineups.get(setterAt) ??
        {
          lineup,
          event,
          setIndex: set.setIndex,
        };
      const opponentServe = event.plays.find(
        (play) => play.team === opponentCode && play.skill === "S",
      );

      if (!current.receptionServe && opponentServe) {
        current.receptionServe = opponentServe;
        current.lineup = lineup;
        current.event = event;
        current.setIndex = set.setIndex;
      }

      lineups.set(setterAt, current);
    });
  });

  return lineups;
}

function getYouTubeEmbedUrl(videoId: string, seekSeconds: number) {
  const params = new URLSearchParams({
    controls: "0",
    modestbranding: "1",
    rel: "0",
    start: String(Math.max(0, Math.floor(seekSeconds))),
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function ReceptionPreview({
  match,
  play,
  settings,
}: {
  match: ParsedMatch;
  play?: ParsedPlay;
  settings: VideoSyncSettings;
}) {
  if (!play) {
    return <p className="muted">レセプション時の相手サーブが見つかりません。</p>;
  }

  const seekSeconds = calculateSeekSeconds(play, settings, match);
  const videoSource = getVideoSourceForSet(settings, play.setIndex);
  const videoId = extractYouTubeVideoId(videoSource.youtubeUrl);

  if (typeof seekSeconds !== "number" || !videoId) {
    return <p className="muted">動画URLまたは同期時刻が未設定です。</p>;
  }

  return (
    <div className="rotation-reception-preview">
      <iframe
        title={`レセプションフォーメーション ${play.id}`}
        src={getYouTubeEmbedUrl(videoId, seekSeconds)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
      <small className="muted">相手サーブ時刻 {formatSeconds(seekSeconds)}</small>
    </div>
  );
}

function RotationLineupCard({
  match,
  lineup,
  receptionServe,
  rotation,
  sourceLabel,
  settings,
}: {
  match: ParsedMatch;
  lineup?: MatchLineup;
  receptionServe?: ParsedPlay;
  rotation: number;
  sourceLabel?: string;
  settings: VideoSyncSettings;
}) {
  return (
    <div className="rotation-team-card rotation-lineup-card">
      <div className="rotation-team-header">
        <strong>S{rotation}</strong>
        <small className="muted">{sourceLabel ?? "データなし"}</small>
      </div>
      {lineup ? (
        <div className="court-grid" aria-label={`S${rotation} lineup`}>
          {COURT_LAYOUT.flatMap((row) =>
            row.map((positionKey) => {
              const value = lineup.positions[positionKey] ?? "-";
              const isSetter = Number(positionKey) === lineup.setterAt;
              return (
                <div
                  className={`court-cell${isSetter ? " court-cell-setter" : ""}`}
                  key={`${rotation}-${positionKey}`}
                >
                  <small>位置{positionKey}</small>
                  <strong>{String(value)}</strong>
                </div>
              );
            }),
          )}
        </div>
      ) : (
        <p className="muted">このローテのラインナップは見つかりません。</p>
      )}
      {lineup ? (
        <div className="rotation-reception-section">
          <small className="muted">レセプションフォーメーション</small>
          <ReceptionPreview match={match} play={receptionServe} settings={settings} />
        </div>
      ) : null}
    </div>
  );
}

export function RotationLineupTab({ match, ownTeamName, settings }: RotationLineupTabProps) {
  if (!match) {
    return (
      <section className="panel">
        <div className="panel-inner stack">
          <h2>ローテ</h2>
          <div className="analysis-block">
            <p className="muted">ローテを表示できる試合データがありません。</p>
          </div>
        </div>
      </section>
    );
  }

  const sideOrder = getSideOrder(match, ownTeamName);

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>ローテ</h2>
          <p className="muted">
            自チームと相手チームのS1〜S6のラインナップを一覧表示します。
          </p>
        </div>

        {sideOrder.map((side, sideIndex) => {
          const teamName = getTeamName(match, side);
          const lineups = buildLineupsByRotation(match, side);
          const sideRole =
            ownTeamName && areTeamNamesEquivalent(teamName, ownTeamName)
              ? "自チーム"
              : sideIndex === 0
                ? getSideLabel(side)
                : "相手チーム";

          return (
            <div className="analysis-block analysis-section-block" key={side}>
              <div className="section-heading">
                <h3>
                  {sideRole}: {teamName}
                </h3>
                <p className="muted">
                  各ローテで最初に確認できたラインナップを表示しています。
                </p>
              </div>
              <div className="rotation-lineup-grid">
                {ROTATIONS.map((rotation) => {
                  const entry = lineups.get(rotation);
                  const sourceLabel = entry
                    ? `セット${entry.setIndex} / ${getRotationLabel(entry.lineup)}`
                    : undefined;
                  return (
                    <RotationLineupCard
                      key={`${side}-${rotation}`}
                      match={match}
                      lineup={entry?.lineup}
                      receptionServe={entry?.receptionServe}
                      rotation={rotation}
                      sourceLabel={sourceLabel}
                      settings={settings}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
