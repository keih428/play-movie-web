"use client";

import { useMemo, useState } from "react";
import {
  buildAggregateAnalysis,
  buildAttackMetricRows,
  buildServeMetricRows,
  getAttackEffectRate,
  getRate,
  getServeEffectRate,
  type AggregateSetScope,
  type AggregateAnalysis,
  type AnalysisMatchInput,
  type AttackMetricRow,
  type AttackCourseSummary,
  type ServeMetricRow,
} from "@/lib/domain/analysis";
import type { ParsedMatch, TeamSide } from "@/lib/domain/types";

type MultiMatchCandidate = {
  id: string;
  name: string;
  matchLabel?: string;
  resultLabel?: string;
  setScoreLabel?: string;
  createdAt: string;
  ownSide: TeamSide;
  match: ParsedMatch;
};

type MultiMatchAnalysisClientProps = {
  candidates: MultiMatchCandidate[];
  teamName: string;
};

type AnalysisCategory =
  | "overview"
  | "attack"
  | "serve"
  | "reception"
  | "block"
  | "rotation"
  | "player";

const ANALYSIS_CATEGORIES: Array<{ key: AnalysisCategory; label: string }> = [
  { key: "overview", label: "概要" },
  { key: "attack", label: "攻撃" },
  { key: "serve", label: "サーブ" },
  { key: "reception", label: "レセプション" },
  { key: "block", label: "ブロック" },
  { key: "rotation", label: "ローテ" },
  { key: "player", label: "個人" },
];

const SET_SCOPE_OPTIONS: Array<{ value: AggregateSetScope; label: string }> = [
  { value: "all", label: "全てのセット" },
  { value: "won", label: "勝ったセットのみ" },
  { value: "lost", label: "負けたセットのみ" },
];

type BlockZoneDivision = "three" | "five";

function formatRate(wins: number, attempts: number): string {
  if (attempts === 0) {
    return "-";
  }

  return `${((wins / attempts) * 100).toFixed(1)}%`;
}

function formatMadeCount(wins: number, attempts: number): string {
  if (attempts === 0) {
    return "-";
  }

  return `${attempts}本中${wins}本`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return value.toFixed(1);
}

function formatRateSum(left: number | undefined, right: number | undefined): string {
  if (left === undefined || right === undefined) {
    return "-";
  }

  return `${(left + right).toFixed(1)}%`;
}

function formatCountRate(count: number, total: number): string {
  return `${count}本（${formatRate(count, total)}）`;
}

function formatAttackCourseSummary(summary: AttackCourseSummary): string {
  if (summary.attempts === 0) {
    return "-";
  }

  return `${formatRate(summary.kills, summary.attempts)} (${summary.kills}/${summary.attempts})`;
}

function getTotalAttackMetric(rows: AttackMetricRow[]): AttackMetricRow {
  return rows.find((row) => row.label === "チーム全体") ?? {
    label: "チーム全体",
    attempts: 0,
    kills: 0,
    attackErrors: 0,
    blockedErrors: 0,
    errors: 0,
  };
}

function getTotalServeMetric(rows: ServeMetricRow[]): ServeMetricRow {
  return rows.find((row) => row.label === "チーム全体") ?? {
    label: "チーム全体",
    attempts: 0,
    noTouchAces: 0,
    serviceAces: 0,
    effective: 0,
    misses: 0,
  };
}

type TeamComparisonMetric = {
  label: string;
  ownValue: number;
  opponentValue: number;
  ownText: string;
  opponentText: string;
  maxValue: number;
};

function buildTeamComparisonMetrics(input: {
  ownAttack: AttackMetricRow;
  opponentAttack: AttackMetricRow;
  ownServe: ServeMetricRow;
  opponentServe: ServeMetricRow;
}): TeamComparisonMetric[] {
  const ownServePoints = input.ownServe.noTouchAces + input.ownServe.serviceAces;
  const opponentServePoints =
    input.opponentServe.noTouchAces + input.opponentServe.serviceAces;
  const ownAttackMissRate =
    input.ownAttack.attempts > 0 ? (input.ownAttack.errors / input.ownAttack.attempts) * 100 : 0;
  const opponentAttackMissRate =
    input.opponentAttack.attempts > 0
      ? (input.opponentAttack.errors / input.opponentAttack.attempts) * 100
      : 0;
  const ownServeMissRate =
    input.ownServe.attempts > 0 ? (input.ownServe.misses / input.ownServe.attempts) * 100 : 0;
  const opponentServeMissRate =
    input.opponentServe.attempts > 0
      ? (input.opponentServe.misses / input.opponentServe.attempts) * 100
      : 0;

  return [
    {
      label: "スパイク決定数",
      ownValue: input.ownAttack.kills,
      opponentValue: input.opponentAttack.kills,
      ownText: `${input.ownAttack.kills}本`,
      opponentText: `${input.opponentAttack.kills}本`,
      maxValue: Math.max(input.ownAttack.kills, input.opponentAttack.kills, 1),
    },
    {
      label: "スパイクミス率",
      ownValue: ownAttackMissRate,
      opponentValue: opponentAttackMissRate,
      ownText: `${input.ownAttack.errors}/${input.ownAttack.attempts} (${formatPercent(ownAttackMissRate)})`,
      opponentText: `${input.opponentAttack.errors}/${input.opponentAttack.attempts} (${formatPercent(opponentAttackMissRate)})`,
      maxValue: 100,
    },
    {
      label: "サーブ得点数",
      ownValue: ownServePoints,
      opponentValue: opponentServePoints,
      ownText: `${ownServePoints}本`,
      opponentText: `${opponentServePoints}本`,
      maxValue: Math.max(ownServePoints, opponentServePoints, 1),
    },
    {
      label: "サーブミス率",
      ownValue: ownServeMissRate,
      opponentValue: opponentServeMissRate,
      ownText: `${input.ownServe.misses}/${input.ownServe.attempts} (${formatPercent(ownServeMissRate)})`,
      opponentText: `${input.opponentServe.misses}/${input.opponentServe.attempts} (${formatPercent(opponentServeMissRate)})`,
      maxValue: 100,
    },
  ];
}

function TeamComparisonChart({
  ownName,
  opponentName,
  metrics,
}: {
  ownName: string;
  opponentName: string;
  metrics: TeamComparisonMetric[];
}) {
  return (
    <div className="team-comparison-chart">
      {metrics.map((metric) => (
        <div className="team-comparison-row" key={metric.label}>
          <div className="team-comparison-label">
            <strong>{metric.label}</strong>
          </div>
          <div className="team-comparison-bars">
            <div className="team-comparison-line">
              <span className="team-comparison-name">{ownName}</span>
              <div className="team-comparison-track">
                <div
                  className="team-comparison-fill team-comparison-fill-own"
                  style={{ width: `${Math.min(100, (metric.ownValue / metric.maxValue) * 100)}%` }}
                />
              </div>
              <span className="mono team-comparison-value">{metric.ownText}</span>
            </div>
            <div className="team-comparison-line">
              <span className="team-comparison-name">{opponentName}</span>
              <div className="team-comparison-track">
                <div
                  className="team-comparison-fill team-comparison-fill-opponent"
                  style={{
                    width: `${Math.min(100, (metric.opponentValue / metric.maxValue) * 100)}%`,
                  }}
                />
              </div>
              <span className="mono team-comparison-value">{metric.opponentText}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatSide(side: TeamSide) {
  return side === "home" ? "home" : "away";
}

function getBlockZoneDivisionLabel(label: string, division: BlockZoneDivision) {
  if (division === "five") {
    return label;
  }

  if (label === "ゾーン1" || label === "ゾーン2") {
    return "ゾーン1（1+2）";
  }
  if (label === "ゾーン4" || label === "ゾーン5") {
    return "ゾーン5（4+5）";
  }
  return label;
}

function getBlockZoneDivisionOrder(label: string) {
  if (label.startsWith("ゾーン1")) {
    return 1;
  }
  if (label === "ゾーン2") {
    return 2;
  }
  if (label === "ゾーン3") {
    return 3;
  }
  if (label === "ゾーン4") {
    return 4;
  }
  if (label.startsWith("ゾーン5")) {
    return 5;
  }
  return Number.MAX_SAFE_INTEGER;
}

function getBlockRowsByDivision(
  rows: AggregateAnalysis["blockSuccessRows"],
  division: BlockZoneDivision,
): AggregateAnalysis["blockSuccessRows"] {
  if (division === "five") {
    return rows;
  }

  const merged = new Map<
    string,
    { code: string; label: string; count: number; opponentAttackCount: number }
  >();

  rows.forEach((row) => {
    const label = getBlockZoneDivisionLabel(row.label, division);
    const current = merged.get(label) ?? {
      code: label,
      label,
      count: 0,
      opponentAttackCount: 0,
    };
    current.count += row.count;
    current.opponentAttackCount += row.opponentAttackCount;
    merged.set(label, current);
  });

  const total = [...merged.values()].reduce((sum, row) => sum + row.count, 0);
  return [...merged.values()]
    .map((row) => ({ ...row, total }))
    .sort((left, right) => {
      const orderDiff =
        getBlockZoneDivisionOrder(left.label) - getBlockZoneDivisionOrder(right.label);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return right.count - left.count;
    });
}

function buildInputs(candidates: MultiMatchCandidate[], selectedIds: string[]): AnalysisMatchInput[] {
  const selected = new Set(selectedIds);
  return candidates
    .filter((candidate) => selected.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      match: candidate.match,
      ownSide: candidate.ownSide,
    }));
}

function OverviewSection({ analysis }: { analysis: AggregateAnalysis }) {
  const comparisonMetrics = buildTeamComparisonMetrics({
    ownAttack: getTotalAttackMetric(analysis.attackMetricRows),
    opponentAttack: getTotalAttackMetric(buildAttackMetricRows(analysis.opponentPlays)),
    ownServe: getTotalServeMetric(analysis.serveMetricRows),
    opponentServe: getTotalServeMetric(buildServeMetricRows(analysis.opponentPlays)),
  });

  return (
    <>
      <div className="meta-grid analysis-summary-grid">
        <div className="meta-card analysis-summary-card">
          <span className="muted">試合数</span>
          <strong>{analysis.matchCount}</strong>
        </div>
        <div className="meta-card analysis-summary-card">
          <span className="muted">セット数</span>
          <strong>{analysis.setCount}</strong>
        </div>
        <div className="meta-card analysis-summary-card">
          <span className="muted">総得点率</span>
          <strong>
            {formatMadeCount(
              analysis.teamAnalysis.wonRallies,
              analysis.teamAnalysis.rallyCount,
            )}
          </strong>
        </div>
        <div className="meta-card analysis-summary-card">
          <span className="muted">Sideout%</span>
          <strong>
            {formatRate(
              analysis.teamAnalysis.sideoutWins,
              analysis.teamAnalysis.sideoutAttempts,
            )}
          </strong>
        </div>
        <div className="meta-card analysis-summary-card">
          <span className="muted">Break%</span>
          <strong>
            {formatRate(
              analysis.teamAnalysis.breakWins,
              analysis.teamAnalysis.breakAttempts,
            )}
          </strong>
        </div>
        <div className="meta-card analysis-summary-card">
          <span className="muted">総プレイ数</span>
          <strong>{analysis.teamPlays.length}</strong>
        </div>
      </div>

      <div className="analysis-block analysis-section-block">
        <h3>試合別サマリー</h3>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>試合</th>
                <th>相手</th>
                <th>セット</th>
                <th>得点率</th>
                <th>Sideout%</th>
                <th>Break%</th>
              </tr>
            </thead>
            <tbody>
              {analysis.matchSummaries.map((row) => (
                <tr key={row.id}>
                  <td data-label="試合">{row.name}</td>
                  <td data-label="相手">{row.opponent}</td>
                  <td data-label="セット">{row.setScore}</td>
                  <td data-label="得点率">
                    {formatMadeCount(row.wonRallies, row.rallyCount)}
                  </td>
                  <td data-label="Sideout%">
                    {formatRate(row.sideoutWins, row.sideoutAttempts)}
                  </td>
                  <td data-label="Break%">
                    {formatRate(row.breakWins, row.breakAttempts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analysis-block analysis-section-block">
        <h3>チーム比較</h3>
        <p className="muted">スパイクとサーブの得点・ミスを自チームと相手で比較します。</p>
        <TeamComparisonChart
          ownName={analysis.teamAnalysis.name}
          opponentName="相手"
          metrics={comparisonMetrics}
        />
      </div>
    </>
  );
}

function AttackSection({ analysis }: { analysis: AggregateAnalysis }) {
  return (
    <>
      <div className="analysis-block analysis-section-block">
        <h3>アタック指標</h3>
        <p className="muted">
          決定率 = 得点数÷打数、効果率 =（得点数−ミス−被ブロック）÷打数。
        </p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>選手</th>
                <th>打数</th>
                <th>得点</th>
                <th>ミス</th>
                <th>被ブロック</th>
                <th>決定率</th>
                <th>効果率</th>
              </tr>
            </thead>
            <tbody>
              {analysis.attackMetricRows.map((row) => (
                <tr key={row.label}>
                  <td data-label="選手">{row.label}</td>
                  <td data-label="打数">{row.attempts}</td>
                  <td data-label="得点">{row.kills}</td>
                  <td data-label="ミス">{row.attackErrors}</td>
                  <td data-label="被ブロック">{row.blockedErrors}</td>
                  <td data-label="決定率">{formatRate(row.kills, row.attempts)}</td>
                  <td data-label="効果率">{formatPercent(getAttackEffectRate(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analysis-block analysis-section-block">
        <h3>フリーボール後の攻撃配分</h3>
        <p className="muted">
          相手フリーボールの後、最初に出た自チームの攻撃を集計します。括弧内はセッターがレシーブした本数です。
        </p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>コード</th>
                <th>攻撃</th>
                <th>本数</th>
                <th>配分率</th>
                <th>決定</th>
                <th>決定率</th>
              </tr>
            </thead>
            <tbody>
              {analysis.freeballAttackRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>該当データなし</td>
                </tr>
              ) : (
                analysis.freeballAttackRows.map((row) => (
                  <tr key={row.label}>
                    <td data-label="コード">{row.code}</td>
                    <td data-label="攻撃">{row.label}</td>
                    <td data-label="本数">
                      {row.count}（{row.setterReceivedCount}）
                    </td>
                    <td data-label="配分率">{formatRate(row.count, row.total)}</td>
                    <td data-label="決定">{row.kills}</td>
                    <td data-label="決定率">{formatRate(row.kills, row.count)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analysis-block analysis-section-block">
        <h3>選手別コース決定率</h3>
        <p className="muted">
          落下地点が打点からコート横幅の半分以内ならフェイント、軌道とネットの角度が60〜90度ならストレート、それ以外はクロスに分類します。
        </p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>選手</th>
                <th>フェイント</th>
                <th>ストレート</th>
                <th>クロス</th>
              </tr>
            </thead>
            <tbody>
              {analysis.attackCourseRows.map((row) => (
                <tr key={row.player}>
                  <td data-label="選手">{row.player}</td>
                  <td data-label="フェイント">{formatAttackCourseSummary(row.feint)}</td>
                  <td data-label="ストレート">{formatAttackCourseSummary(row.straight)}</td>
                  <td data-label="クロス">{formatAttackCourseSummary(row.cross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ServeSection({ analysis }: { analysis: AggregateAnalysis }) {
  return (
    <>
      <div className="analysis-block analysis-section-block">
        <h3>サーブ指標</h3>
        <p className="muted">
          効果率 =（サービスエース×100 + 効果×25 - サーブミス×25）÷打数。サービスエースにはノータッチも含めます。
        </p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>選手</th>
                <th>打数</th>
                <th>ノータッチ</th>
                <th>サービスエース</th>
                <th>効果</th>
                <th>ミス</th>
                <th>ミス率</th>
                <th>効果率</th>
              </tr>
            </thead>
            <tbody>
              {analysis.serveMetricRows.map((row) => (
                <tr key={row.label}>
                  <td data-label="選手">{row.label}</td>
                  <td data-label="打数">{row.attempts}</td>
                  <td data-label="ノータッチ">{row.noTouchAces}</td>
                  <td data-label="サービスエース">{row.serviceAces}</td>
                  <td data-label="効果">{row.effective}</td>
                  <td data-label="ミス">{row.misses}</td>
                  <td data-label="ミス率">{formatRate(row.misses, row.attempts)}</td>
                  <td data-label="効果率">{formatNumber(getServeEffectRate(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analysis-block analysis-section-block">
        <h3>サーブ時のブレイク率比較</h3>
        <p className="muted">ミス込みと、サーブミスを除いた場合を比較します。</p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>選手</th>
                <th>ミス込み</th>
                <th>ミス除外</th>
                <th>差分</th>
              </tr>
            </thead>
            <tbody>
              {analysis.serveBreakRows.map((row) => {
                const includedRate = getRate(row.breaks, row.attempts);
                const nonMissRate = getRate(row.nonMissBreaks, row.nonMissAttempts);
                const diff =
                  includedRate === undefined || nonMissRate === undefined
                    ? undefined
                    : nonMissRate - includedRate;

                return (
                  <tr key={row.player}>
                    <td data-label="選手">{row.player}</td>
                    <td data-label="ミス込み">
                      {formatPercent(includedRate)} ({row.breaks}/{row.attempts})
                    </td>
                    <td data-label="ミス除外">
                      {formatPercent(nonMissRate)} ({row.nonMissBreaks}/
                      {row.nonMissAttempts})
                    </td>
                    <td data-label="差分">
                      {diff === undefined ? "-" : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pt`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ReceptionSection({ analysis }: { analysis: AggregateAnalysis }) {
  return (
    <div className="analysis-block analysis-section-block">
      <h3>レセプション</h3>
      <p className="muted">AB率は # / +、BC率は + / !、ミス率は = で計算します。</p>
      <div className="score-table-wrap">
        <table className="score-table analysis-player-table">
          <thead>
            <tr>
              <th>選手</th>
              <th>本数</th>
              <th>AB</th>
              <th>BC</th>
              <th>AB率</th>
              <th>BC率</th>
              <th>ミス</th>
              <th>ミス率</th>
            </tr>
          </thead>
          <tbody>
            {analysis.receptionMetricRows.map((row) => (
              <tr key={row.label}>
                <td data-label="選手">{row.label}</td>
                <td data-label="本数">{row.attempts}</td>
                <td data-label="AB">{row.ab}</td>
                <td data-label="BC">{row.bc}</td>
                <td data-label="AB率">{formatRate(row.ab, row.attempts)}</td>
                <td data-label="BC率">{formatRate(row.bc, row.attempts)}</td>
                <td data-label="ミス">{row.errors}</td>
                <td data-label="ミス率">{formatRate(row.errors, row.attempts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlockSection({ analysis }: { analysis: AggregateAnalysis }) {
  const [zoneDivision, setZoneDivision] = useState<BlockZoneDivision>("three");
  const opponentAttacks = analysis.blockOpponentAttacks;
  const successes = analysis.blockSetRows.reduce(
    (sum, row) => sum + row.successes,
    0,
  );
  const misses = analysis.blockSetRows.reduce((sum, row) => sum + row.misses, 0);
  const tables = [
    {
      title: "ブロック成功",
      rows: getBlockRowsByDivision(analysis.blockSuccessRows, zoneDivision),
      probabilityLabel: "成功確率",
      shareLabel: undefined,
    },
    {
      title: "ブロックミス",
      rows: getBlockRowsByDivision(analysis.blockMissRows, zoneDivision),
      probabilityLabel: "ミス確率",
      shareLabel: "失点割合",
    },
  ];

  return (
    <div className="analysis-block analysis-section-block">
      <h3>ブロック</h3>
      <p className="muted">
        相手スパイク {opponentAttacks}本 / 成功 {successes}本（{formatRate(successes, opponentAttacks)}） / ミス {misses}本（{formatRate(misses, opponentAttacks)}）
      </p>
      <div className="comparison-stack">
        <div>
          <h4>個人ブロック成績</h4>
          <div className="score-table-wrap">
            <table className="score-table analysis-player-table">
              <thead>
                <tr>
                  <th>選手</th>
                  <th>出場セット</th>
                  <th>ブロック成功</th>
                  <th>ブロック失敗</th>
                </tr>
              </thead>
              <tbody>
                {analysis.blockPlayerRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>該当データなし</td>
                  </tr>
                ) : (
                  analysis.blockPlayerRows.map((row) => (
                    <tr key={row.player}>
                      <td data-label="選手">{row.player}</td>
                      <td data-label="出場セット">{row.setAppearances}</td>
                      <td data-label="ブロック成功">{row.successes}</td>
                      <td data-label="ブロック失敗">{row.misses}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-heading-row">
          <div>
            <h4>ゾーン別ブロック集計</h4>
            <p className="muted">
              三分割ではゾーン2をゾーン1へ、ゾーン4をゾーン5へ合算します。
            </p>
          </div>
          <div className="toggle-switch" role="group" aria-label="ブロックゾーン分割">
            <button
              className={zoneDivision === "three" ? "toggle-switch-button active" : "toggle-switch-button"}
              type="button"
              onClick={() => setZoneDivision("three")}
            >
              三分割
            </button>
            <button
              className={zoneDivision === "five" ? "toggle-switch-button active" : "toggle-switch-button"}
              type="button"
              onClick={() => setZoneDivision("five")}
            >
              五分割
            </button>
          </div>
        </div>

        {tables.map((table) => (
          <div key={table.title}>
            <h4>{table.title}</h4>
            <div className="score-table-wrap">
              <table className="score-table analysis-player-table">
                <thead>
                  <tr>
                    <th>ゾーン</th>
                    <th>本数</th>
                    <th>相手スパイク</th>
                    <th>{table.probabilityLabel}</th>
                    {table.shareLabel ? <th>{table.shareLabel}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length === 0 ? (
                    <tr>
                      <td colSpan={table.shareLabel ? 5 : 4}>該当データなし</td>
                    </tr>
                  ) : (
                    table.rows.map((row) => (
                      <tr key={`${table.title}-${row.label}`}>
                        <td data-label="ゾーン">{row.label}</td>
                        <td data-label="本数">{row.count}</td>
                        <td data-label="相手スパイク">{row.opponentAttackCount}</td>
                        <td data-label={table.probabilityLabel}>
                          {formatRate(row.count, row.opponentAttackCount)}
                        </td>
                        {table.shareLabel ? (
                          <td data-label={table.shareLabel}>
                            {formatRate(row.count, row.total)}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RotationSection({ analysis }: { analysis: AggregateAnalysis }) {
  return (
    <div className="comparison-stack">
      <div className="analysis-block analysis-section-block">
        <h3>ローテ</h3>
        <p className="muted">S1〜S6ごとのBreak率、Sideout率、その和を表示します。</p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>ローテ</th>
                <th>Break</th>
                <th>Sideout</th>
                <th>合計</th>
              </tr>
            </thead>
            <tbody>
              {analysis.teamAnalysis.rotations.map((row) => {
                const breakRate = getRate(row.breakWins, row.breakAttempts);
                const sideoutRate = getRate(row.sideoutWins, row.sideoutAttempts);
                const rotationLabel = row.rotationLabel.replace("ローテ", "S");

                return (
                  <tr key={row.rotationLabel}>
                    <td data-label="ローテ">{rotationLabel}</td>
                    <td data-label="Break">
                      {formatPercent(breakRate)} ({row.breakWins}/{row.breakAttempts})
                    </td>
                    <td data-label="Sideout">
                      {formatPercent(sideoutRate)} ({row.sideoutWins}/{row.sideoutAttempts})
                    </td>
                    <td data-label="合計">{formatRateSum(breakRate, sideoutRate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analysis-block analysis-section-block">
        <h3>ローテ別 得点要因</h3>
        <p className="muted">
          サーブ得点はBreak得点数、その他は各ローテの得点数を分母にして割合を表示します。
        </p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>ローテ</th>
                <th>サーブ得点</th>
                <th>アタック得点</th>
                <th>ブロック得点</th>
                <th>相手ミス</th>
              </tr>
            </thead>
            <tbody>
              {analysis.rotationPointCauseRows.map((row) => {
                const rotationLabel = row.rotationLabel.replace("ローテ", "S");

                return (
                  <tr key={row.rotationLabel}>
                    <td data-label="ローテ">{rotationLabel}</td>
                    <td data-label="サーブ得点">
                      {formatCountRate(row.servePoints, row.breakWins)}
                    </td>
                    <td data-label="アタック得点">
                      {formatCountRate(row.attackPoints, row.wonRallies)}
                    </td>
                    <td data-label="ブロック得点">
                      {formatCountRate(row.blockPoints, row.wonRallies)}
                    </td>
                    <td data-label="相手ミス">
                      {formatCountRate(row.opponentErrors, row.wonRallies)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analysis-block analysis-section-block">
        <h3>ローテ別 失点要因</h3>
        <p className="muted">
          レセプションミスはSideout失点数、サーブミスはBreak失点数、その他は各ローテの失点数を分母にして割合を表示します。
        </p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>ローテ</th>
                <th>レセプションミス</th>
                <th>サーブミス</th>
                <th>スパイクミス</th>
                <th>相手ブロック</th>
                <th>相手スパイク</th>
                <th>その他ミス</th>
              </tr>
            </thead>
            <tbody>
              {analysis.rotationPointCauseRows.map((row) => {
                const rotationLabel = row.rotationLabel.replace("ローテ", "S");

                return (
                  <tr key={row.rotationLabel}>
                    <td data-label="ローテ">{rotationLabel}</td>
                    <td data-label="レセプションミス">
                      {formatCountRate(row.receptionErrors, row.sideoutLosses)}
                    </td>
                    <td data-label="サーブミス">
                      {formatCountRate(row.serveErrors, row.breakLosses)}
                    </td>
                    <td data-label="スパイクミス">
                      {formatCountRate(row.attackErrors, row.lostRallies)}
                    </td>
                    <td data-label="相手ブロック">
                      {formatCountRate(row.opponentBlockPoints, row.lostRallies)}
                    </td>
                    <td data-label="相手スパイク">
                      {formatCountRate(row.opponentAttackPoints, row.lostRallies)}
                    </td>
                    <td data-label="その他ミス">
                      {formatCountRate(row.otherErrors, row.lostRallies)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PlayerSection({ analysis }: { analysis: AggregateAnalysis }) {
  return (
    <div className="analysis-block analysis-section-block">
      <h3>個人成績</h3>
      <div className="score-table-wrap">
        <table className="score-table analysis-player-table">
          <thead>
            <tr>
              <th>選手</th>
              <th>総プレイ</th>
              <th>サーブ</th>
              <th>レセプション</th>
              <th>アタック</th>
              <th>ブロック</th>
              <th>直接得点</th>
              <th>ミス</th>
            </tr>
          </thead>
          <tbody>
            {analysis.teamAnalysis.players.map((row) => (
              <tr key={row.player}>
                <td data-label="選手">{row.player}</td>
                <td data-label="総プレイ">{row.total}</td>
                <td data-label="サーブ">{row.serve}</td>
                <td data-label="レセプション">{row.receive}</td>
                <td data-label="アタック">{row.attack}</td>
                <td data-label="ブロック">{row.block}</td>
                <td data-label="直接得点">{row.directPoints}</td>
                <td data-label="ミス">{row.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MultiMatchAnalysisClient({
  candidates,
  teamName,
}: MultiMatchAnalysisClientProps) {
  const [selectedIds, setSelectedIds] = useState(() =>
    candidates.slice(0, 5).map((candidate) => candidate.id),
  );
  const [activeCategory, setActiveCategory] =
    useState<AnalysisCategory>("overview");
  const [setScope, setSetScope] = useState<AggregateSetScope>("all");

  const selectedInputs = useMemo(
    () => buildInputs(candidates, selectedIds),
    [candidates, selectedIds],
  );
  const analysis = useMemo(
    () => buildAggregateAnalysis(selectedInputs, setScope),
    [selectedInputs, setScope],
  );
  const selectedSet = new Set(selectedIds);

  return (
    <section className="panel analysis-panel">
      <div className="panel-inner stack">
        <div className="section-heading-row">
          <div>
            <h2>{teamName} 総合分析</h2>
            <p className="muted">
              自チーム名が一致する試合を複数選択し、選択範囲全体の統計を集計します。
            </p>
          </div>
        </div>

        <div className="analysis-block analysis-section-block">
          <div className="section-heading-row">
            <div>
              <h3>試合選択</h3>
              <p className="muted">選択中 {selectedIds.length} / {candidates.length} 試合</p>
            </div>
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setSelectedIds(candidates.map((candidate) => candidate.id))}
              >
                すべて選択
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setSelectedIds([])}
              >
                すべて解除
              </button>
            </div>
          </div>

          {candidates.length === 0 ? (
            <p className="muted">自チーム名が一致する試合がありません。</p>
          ) : (
            <div className="workspace-row-list analysis-match-selector-list">
              {candidates.map((candidate) => (
                <label className="workspace-row" key={candidate.id}>
                  <span className="workspace-row-cell">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(candidate.id)}
                      onChange={(event) => {
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...current, candidate.id]
                            : current.filter((id) => id !== candidate.id),
                        );
                      }}
                    />
                  </span>
                  <strong className="workspace-row-title">{candidate.name}</strong>
                  <span className="workspace-row-cell muted">
                    {candidate.matchLabel ?? "対戦カード未設定"}
                  </span>
                  <span className="workspace-row-cell">
                    {candidate.resultLabel ?? "結果未取得"}
                  </span>
                  <span className="workspace-row-cell">
                    {candidate.setScoreLabel ?? "-"}
                  </span>
                  <span className="workspace-row-cell mono">
                    {formatSide(candidate.ownSide)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {selectedInputs.length === 0 ? (
          <div className="analysis-block">
            <p className="muted">分析する試合を1つ以上選択してください。</p>
          </div>
        ) : (
          <>
            <div className="analysis-tab-toolbar">
              <div className="tab-row" role="tablist" aria-label="分析カテゴリ切替">
                {ANALYSIS_CATEGORIES.map((category) => (
                  <button
                    key={category.key}
                    className={`tab-button${activeCategory === category.key ? " tab-button-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === category.key}
                    onClick={() => setActiveCategory(category.key)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <div className="field analysis-set-scope-field">
                <label htmlFor="aggregate-set-scope">集計範囲</label>
                <select
                  id="aggregate-set-scope"
                  value={setScope}
                  onChange={(event) =>
                    setSetScope(event.target.value as AggregateSetScope)
                  }
                >
                  {SET_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeCategory === "overview" ? <OverviewSection analysis={analysis} /> : null}
            {activeCategory === "attack" ? <AttackSection analysis={analysis} /> : null}
            {activeCategory === "serve" ? <ServeSection analysis={analysis} /> : null}
            {activeCategory === "reception" ? <ReceptionSection analysis={analysis} /> : null}
            {activeCategory === "block" ? <BlockSection analysis={analysis} /> : null}
            {activeCategory === "rotation" ? <RotationSection analysis={analysis} /> : null}
            {activeCategory === "player" ? <PlayerSection analysis={analysis} /> : null}
          </>
        )}
      </div>
    </section>
  );
}
