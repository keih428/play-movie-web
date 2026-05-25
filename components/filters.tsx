type FiltersProps = {
  teamOptions: string[];
  playerOptions: string[];
  skillOptions: string[];
  filters: {
    team: string;
    player: string;
    skill: string;
  };
  onChange: (filters: {
    team: string;
    player: string;
    skill: string;
  }) => void;
};

export function Filters({
  teamOptions,
  playerOptions,
  skillOptions,
  filters,
  onChange,
}: FiltersProps) {
  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h3>絞り込み</h3>
          <p className="muted">
            MVP ではチーム、選手、スキル、セット単位の絞り込みをここに実装します。
          </p>
        </div>

        <div className="field">
          <label htmlFor="team-filter">チーム</label>
          <select
            id="team-filter"
            value={filters.team}
            onChange={(event) =>
              onChange({
                ...filters,
                team: event.target.value,
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
                {skill}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
