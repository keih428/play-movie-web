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
                  <strong>{item.play.skill ?? "-"}</strong>
                  {" / "}
                  <span>{item.play.player ?? "不明な選手"}</span>
                  {" / "}
                  <span>{item.play.effect ?? "-"}</span>
                </div>
                <small>
                  スコア {item.score.home} - {item.score.away}
                </small>
                <div className="tag-row">
                  <span className="tag">チーム: {item.play.team || "-"}</span>
                  <span className="tag">コード: {item.play.code || "-"}</span>
                </div>
                <div className="button-row" style={{ marginTop: 10 }}>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => onSelectPlay(item.play)}
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
