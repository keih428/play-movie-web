import { getSkillLabel } from "@/lib/domain/display";
import { formatRotationLabel } from "@/lib/domain/rotation";

type FiltersProps = {
  teamOptions: string[];
  playerOptions: string[];
  skillOptions: string[];
  rotationOptions: string[];
  setOptions: number[];
  selectedSetIndex?: number;
  rallyResult: "all" | "scored" | "conceded";
  minPlayCount: number;
  filters: {
    team: string;
    player: string;
    skill: string;
    rotation: string;
    rallyPhase: string;
  };
  onChange: (filters: {
    team: string;
    player: string;
    skill: string;
    rotation: string;
    rallyPhase: string;
  }) => void;
  onSelectedSetIndexChange: (setIndex: number | undefined) => void;
  onRallyResultChange: (result: "all" | "scored" | "conceded") => void;
  onMinPlayCountChange: (count: number) => void;
};

export function Filters({
  teamOptions,
  playerOptions,
  skillOptions,
  rotationOptions,
  setOptions,
  selectedSetIndex,
  rallyResult,
  minPlayCount,
  filters,
  onChange,
  onSelectedSetIndexChange,
  onRallyResultChange,
  onMinPlayCountChange,
}: FiltersProps) {
  return (
    <section className="panel review-filter-panel">
      <div className="panel-inner">
        <div className="review-filter-header">
          <div>
            <h3>レビュー条件</h3>
            <p className="muted">表示するセット・ラリー・プレイをまとめて絞り込みます</p>
          </div>
        </div>

        <div className="filters-grid">
          <div className="field">
            <label htmlFor="review-set-filter">セット</label>
            <select
              id="review-set-filter"
              value={selectedSetIndex ?? "all"}
              onChange={(event) =>
                onSelectedSetIndexChange(
                  event.target.value === "all" ? undefined : Number(event.target.value),
                )
              }
            >
              <option value="all">すべてのセット</option>
              {setOptions.map((setIndex) => (
                <option key={setIndex} value={setIndex}>
                  第{setIndex}セット
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="team-filter">チーム</label>
            <select
              id="team-filter"
              value={filters.team}
              onChange={(event) =>
                onChange({
                  team: event.target.value,
                  player: "all",
                  skill: "all",
                  rotation: "all",
                  rallyPhase: "all",
                })
              }
            >
              <option value="all">すべてのチーム</option>
              {teamOptions.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="player-filter">選手</label>
            <select
              id="player-filter"
              value={filters.player}
              onChange={(event) =>
                onChange({
                  ...filters,
                  player: event.target.value,
                })
              }
            >
              <option value="all">すべての選手</option>
              {playerOptions.map((player) => (
                <option key={player} value={player}>
                  {player}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="skill-filter">スキル</label>
            <select
              id="skill-filter"
              value={filters.skill}
              onChange={(event) =>
                onChange({
                  ...filters,
                  skill: event.target.value,
                })
              }
            >
              <option value="all">すべてのスキル</option>
              {skillOptions.map((skill) => (
                <option key={skill} value={skill}>
                  {getSkillLabel(skill)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="rotation-filter">自チームローテ</label>
            <select
              id="rotation-filter"
              value={filters.rotation}
              onChange={(event) =>
                onChange({
                  ...filters,
                  rotation: event.target.value,
                })
              }
            >
              <option value="all">すべてのローテ</option>
              {rotationOptions.map((rotation) => (
                <option key={rotation} value={rotation}>
                  {formatRotationLabel(rotation)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="rally-phase-filter">ラリー区分</label>
            <select
              id="rally-phase-filter"
              value={filters.rallyPhase}
              onChange={(event) =>
                onChange({
                  ...filters,
                  rallyPhase: event.target.value,
                })
              }
            >
              <option value="all">すべての区分</option>
              <option value="sideout">サイドアウト</option>
              <option value="break">ブレイク</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="rally-result-filter">ラリー結果</label>
            <select
              id="rally-result-filter"
              value={rallyResult}
              onChange={(event) =>
                onRallyResultChange(
                  event.target.value as "all" | "scored" | "conceded",
                )
              }
            >
              <option value="all">すべて</option>
              <option value="scored">得点</option>
              <option value="conceded">失点</option>
            </select>
          </div>

          <div className="field review-min-play-field">
            <label htmlFor="review-min-plays">最小プレイ数</label>
            <input
              id="review-min-plays"
              type="number"
              min={1}
              max={99}
              value={minPlayCount}
              onChange={(event) =>
                onMinPlayCountChange(
                  Math.max(1, Math.min(99, Number(event.target.value) || 1)),
                )
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
