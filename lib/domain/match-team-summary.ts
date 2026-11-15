import {
  buildRotationRows,
  buildServeMetricRows,
  getServeEffectRate,
  getTeamPlays,
  type ServeMetricRow,
} from "@/lib/domain/analysis";
import { formatRotationLabel } from "@/lib/domain/rotation";
import type { ParsedMatch, TeamSide } from "@/lib/domain/types";

/**
 * 部内ページの「試合」に出す、その試合のチームのまとめ(2026-11-15 から。けーいちの依頼)。
 * ローテ別のサイドアウト率・ブレイク率と、サーブの成績(チーム全体と選手ごと、効果率の高い順)。
 * 数え方は試合ビューアの分析と同じ関数を使う(画面によって数字が違わないように)。
 */
export type RotationSummaryRow = {
  label: string;
  sideoutWins: number;
  sideoutAttempts: number;
  breakWins: number;
  breakAttempts: number;
};

export type ServeSummaryRow = {
  /** 背番号(チーム全体の行は null) */
  number: string | null;
  attempts: number;
  aces: number;
  effective: number;
  misses: number;
  /** 効果率(%)。打数が 0 なら null */
  effectRate: number | null;
};

export type MatchTeamSummary = {
  rotations: RotationSummaryRow[];
  rotationTotal: RotationSummaryRow;
  serveTeam: ServeSummaryRow;
  servePlayers: ServeSummaryRow[];
};

function toServeRow(
  row: ServeMetricRow,
  number: string | null,
): ServeSummaryRow {
  return {
    number,
    attempts: row.attempts,
    aces: row.noTouchAces + row.serviceAces,
    effective: row.effective,
    misses: row.misses,
    effectRate: getServeEffectRate(row) ?? null,
  };
}

export function buildMatchTeamSummary(
  match: ParsedMatch,
  side: TeamSide,
): MatchTeamSummary {
  // ローテは S1〜S6 の順(セッターの位置が分からないラリーは「-」で最後)。
  const rotations = buildRotationRows(match.sets, side)
    .map((row) => ({
      label: formatRotationLabel(row.rotationLabel).replace(/^ローテ/, ""),
      sideoutWins: row.sideoutWins,
      sideoutAttempts: row.sideoutAttempts,
      breakWins: row.breakWins,
      breakAttempts: row.breakAttempts,
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, "ja", { numeric: true }),
    );
  const rotationTotal = rotations.reduce<RotationSummaryRow>(
    (sum, row) => ({
      label: "合計",
      sideoutWins: sum.sideoutWins + row.sideoutWins,
      sideoutAttempts: sum.sideoutAttempts + row.sideoutAttempts,
      breakWins: sum.breakWins + row.breakWins,
      breakAttempts: sum.breakAttempts + row.breakAttempts,
    }),
    {
      label: "合計",
      sideoutWins: 0,
      sideoutAttempts: 0,
      breakWins: 0,
      breakAttempts: 0,
    },
  );

  // 先頭の行がチーム全体。選手は効果率の高い順、同じなら打数の多い順。
  const [team, ...players] = buildServeMetricRows(getTeamPlays(match, side));
  const servePlayers = players
    .map((row) => toServeRow(row, row.label))
    .sort(
      (left, right) =>
        (right.effectRate ?? -Infinity) - (left.effectRate ?? -Infinity) ||
        right.attempts - left.attempts,
    );

  return {
    rotations,
    rotationTotal,
    serveTeam: toServeRow(team, null),
    servePlayers,
  };
}

/** 「60%(12/20)」の形。数が 0 なら「-」。 */
export function formatWinRate(wins: number, attempts: number): string {
  return attempts === 0
    ? "-"
    : `${Math.round((wins / attempts) * 100)}%(${wins}/${attempts})`;
}

/** 効果率を「12.5%」の形で。 */
export function formatEffectRate(rate: number | null): string {
  return rate === null ? "-" : `${rate.toFixed(1)}%`;
}
