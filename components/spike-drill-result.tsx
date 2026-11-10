import { SpikeRankingTables } from "@/components/spike-rankings";
import {
  FRONT_SPOTS,
  SPIKE_MODES,
  SPIKE_MODE_LABELS,
  SPIKE_TEAM_LABELS,
  formatSpikeRate,
  sumCounts,
  type SpikeCount,
  type SpikeMode,
  type SpikeSpot,
  type SpikeTeam,
} from "@/lib/domain/spike-stats";

type SpikeDrillResultProps = {
  counts: SpikeCount[];
  teams: Record<string, SpikeTeam>;
  nameOf: (id: string) => string;
};

const inMode = (mode: SpikeMode, spot: SpikeSpot) =>
  mode === "front" ? (FRONT_SPOTS as readonly SpikeSpot[]).includes(spot) : spot === mode;

/**
 * 1つのメニューの結果(2026-11-10 から。主将の依頼)。数える画面の「結果」で出す。
 * いちばん上に前半・後半のチーム戦(種目ごとの決定/打数。決定率が低いほうが赤)、
 * その下に位置ごとのスパイカーの表とセッターの表(月の順位と同じ形。このメニューだけなので規定打数はなし)。
 */
export function SpikeDrillResult({ counts, teams, nameOf }: SpikeDrillResultProps) {
  const modes = SPIKE_MODES.filter((mode) => counts.some((entry) => inMode(mode, entry.spot)));
  const cell = (mode: SpikeMode | null, team: SpikeTeam) =>
    sumCounts(counts.filter((entry) => teams[entry.memberId] === team && (mode === null || inMode(mode, entry.spot))));
  const rows = [
    ...modes.map((mode) => ({ label: SPIKE_MODE_LABELS[mode], first: cell(mode, "first"), second: cell(mode, "second") })),
    { label: "合計", first: cell(null, "first"), second: cell(null, "second") },
  ];
  // 決定率の低いほう(ペナルティ)。同じなら、どちらも赤くしない。
  const loser = (row: (typeof rows)[number]): SpikeTeam | null => {
    if (!row.first.attempts || !row.second.attempts) {
      return null;
    }
    const diff = row.first.kills * row.second.attempts - row.second.kills * row.first.attempts;
    return diff === 0 ? null : diff < 0 ? "first" : "second";
  };

  if (counts.length === 0) {
    return <p className="tp-muted">このメニューのスパイクの記録はまだありません。</p>;
  }

  return (
    <>
      <h3 className="tp-spike-rank-title">チーム戦</h3>
      <div className="tp-card tp-scroll">
        <table className="tp-roster tp-stat-table">
          <thead>
            <tr>
              <th>種目</th>
              {(["first", "second"] as const).map((team) => (
                <th key={team}>
                  {SPIKE_TEAM_LABELS[team]}攻撃
                  <span className="tp-sub">決定/打数</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={row.label === "合計" ? "tp-spike-top" : undefined}>
                <td className="tp-nowrap">{row.label}</td>
                {(["first", "second"] as const).map((team) => (
                  <td key={team} className={`tp-num tp-nowrap${loser(row) === team ? " tp-spike-lose" : ""}`}>
                    {row[team].attempts
                      ? `${row[team].kills} / ${row[team].attempts} (${formatSpikeRate(row[team].kills, row[team].attempts)})`
                      : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SpikeRankingTables
        spikerCounts={counts}
        setterCounts={counts}
        nameOf={nameOf}
        minAttempts={1}
        emptyText="このメニューのスパイクの記録はまだありません。"
      />
    </>
  );
}
