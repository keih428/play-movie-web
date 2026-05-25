import { getEffectGrade, getSkillLabel, getTeamLabel } from "@/lib/domain/display";
import { getRotationLabel } from "@/lib/domain/rotation";
import { calculateSeekSeconds, formatSeconds } from "@/lib/domain/video";
import type { ParsedMatch, ParsedPlay, VideoSyncSettings } from "@/lib/domain/types";

type PlayListProps = {
  match?: ParsedMatch;
  settings: VideoSyncSettings;
  selectedPlayId?: string;
  onSelectPlay: (play: ParsedPlay) => void;
};

export function PlayList({
  match,
  settings,
  selectedPlayId,
  onSelectPlay,
}: PlayListProps) {
  const playItems =
    match?.sets.flatMap((set) =>
      set.events.flatMap((event) =>
        event.plays.map((play, index) => ({
          key: `${set.id}-${event.id}-${play.id}-${index}`,
          setIndex: set.setIndex,
          eventIndex: event.eventIndex,
          play,
          seekSeconds: calculateSeekSeconds(play, settings),
          score: event.score,
          homeRotation: getRotationLabel(event.lineup.home),
          awayRotation: getRotationLabel(event.lineup.away),
        })),
      ),
    ) ?? [];

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>プレイ一覧</h2>
          <p className="muted">
            クリック時に YouTube シークへつなぐ前提で、正規化済みプレイを一覧表示します。
          </p>
        </div>

        <div className="list">
          {playItems.length === 0 ? (
            <div className="list-item">
              <strong>解析結果なし</strong>
              <p className="muted">
                API と接続すると、ここに `.vsm` / `.vsdb` から抽出したプレイが表示されます。
              </p>
            </div>
          ) : (
            playItems.map((item) => (
              <article
                className={`list-item${selectedPlayId === item.play.id ? " list-item-active" : ""}`}
                key={item.key}
              >
                <div className="list-item-header">
                  <strong>
                    セット {item.setIndex} / ラリー {item.eventIndex}
                  </strong>
                  <small className="mono">
                    {formatSeconds(item.seekSeconds)}
                  </small>
                </div>
                <div>
                  <strong>{getSkillLabel(item.play.skill)}</strong>
                  {" / "}
                  <span>{item.play.player ?? "不明な選手"}</span>
                  {" / "}
                  <span>{getEffectGrade(item.play.effect)}</span>
                </div>
                <small>
                  スコア {item.score.home} - {item.score.away}
                </small>
                <div className="tag-row">
                  <span className="tag">チーム: {getTeamLabel(item.play.team, match)}</span>
                  <span className="tag">自チーム: {item.homeRotation}</span>
                  <span className="tag">相手チーム: {item.awayRotation}</span>
                  <span className="tag">コード: {item.play.code || "-"}</span>
                </div>
                <div className="button-row" style={{ marginTop: 10 }}>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      onSelectPlay({
                        ...item.play,
                        setIndex: item.setIndex,
                      })
                    }
                  >
                    このプレイへ移動
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
