"use client";

import { useMemo, useState } from "react";
import { getSkillLabel } from "@/lib/domain/display";
import {
  buildAggregateAnalysis,
  getAttackEffectRate,
  getRate,
  getServeEffectRate,
  getSkillSummaryRow,
  type AggregateSetScope,
  type AggregateAnalysis,
  type AnalysisMatchInput,
  type AttackCourseSummary,
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
  | "player";

const ANALYSIS_CATEGORIES: Array<{ key: AnalysisCategory; label: string }> = [
  { key: "overview", label: "概要" },
  { key: "attack", label: "攻撃" },
  { key: "serve", label: "サーブ" },
  { key: "reception", label: "レセプション" },
  { key: "block", label: "ブロック" },
  { key: "player", label: "個人" },
];

const SET_SCOPE_OPTIONS: Array<{ value: AggregateSetScope; label: string }> = [
  { value: "all", label: "全てのセット" },
  { value: "won", label: "勝ったセットのみ" },
  { value: "lost", label: "負けたセットのみ" },
];

function formatRate(wins: number, attempts: number): string {
  if (attempts === 0) {
    return "-";
  }

  return `${((wins / attempts) * 100).toFixed(1)}%`;
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

function formatAttackCourseSummary(summary: AttackCourseSummary): string {
  if (summary.attempts === 0) {
    return "-";
  }

  return `${formatRate(summary.kills, summary.attempts)} (${summary.kills}/${summary.attempts})`;
}

function formatSide(side: TeamSide) {
  return side === "home" ? "home" : "away";
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
  const gradeOrder = ["A", "B", "C", "D", "E", "F"];
  const comparisonSkills = analysis.teamAnalysis.skillSummary
    .map((row) => row.skill)
    .sort((left, right) => getSkillLabel(left).localeCompare(getSkillLabel(right), "ja"));

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
            {formatRate(
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
                    {formatRate(row.wonRallies, row.rallyCount)}
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
        <h3>スキル内訳</h3>
        <div className="skill-bars">
          {comparisonSkills.map((skill) => {
            const row = getSkillSummaryRow(analysis.teamAnalysis.skillSummary, skill);
            return (
              <div className="skill-bar-row" key={row.skill}>
                <div className="skill-bar-meta">
                  <strong>{getSkillLabel(row.skill)}</strong>
                  <span className="mono">{row.count}</span>
                </div>
                <div className="skill-bar-track skill-bar-track-stacked">
                  {gradeOrder.map((grade) => {
                    const count = row.gradeCounts[grade] ?? 0;
                    return count > 0 ? (
                      <div
                        className={`skill-bar-segment skill-bar-grade-${grade}`}
                        key={grade}
                        style={{
                          width: `${(count / Math.max(1, row.count)) * 100}%`,
                        }}
                        title={`${grade}: ${count}`}
                      />
                    ) : null;
                  })}
                </div>
                <div className="tag-row">
                  {gradeOrder.map((grade) => (
                    <span
                      className={`tag skill-grade-tag skill-grade-tag-${grade}`}
                      key={grade}
                    >
                      {grade} {row.gradeCounts[grade] ?? 0}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
          決定率 = 得点数÷打数、効果率 =（得点数−失点数）÷打数。
        </p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>選手</th>
                <th>打数</th>
                <th>得点</th>
                <th>失点</th>
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
                  <td data-label="失点">{row.errors}</td>
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
        <p className="muted">相手フリーボールの後、最初に出た自チームの攻撃を集計します。</p>
        <div className="score-table-wrap">
          <table className="score-table analysis-player-table">
            <thead>
              <tr>
                <th>攻撃</th>
                <th>本数</th>
                <th>配分率</th>
              </tr>
            </thead>
            <tbody>
              {analysis.freeballAttackRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>該当データなし</td>
                </tr>
              ) : (
                analysis.freeballAttackRows.map((row) => (
                  <tr key={row.label}>
                    <td data-label="攻撃">{row.label}</td>
                    <td data-label="本数">{row.count}</td>
                    <td data-label="配分率">{formatRate(row.count, row.total)}</td>
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
          効果率 =（ノータッチエース×100 + サービスエース×80 + 効果×25）÷打数。
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
      <p className="muted">AB率は # / +、ミス率は = で計算します。</p>
      <div className="score-table-wrap">
        <table className="score-table analysis-player-table">
          <thead>
            <tr>
              <th>選手</th>
              <th>本数</th>
              <th>AB</th>
              <th>ミス</th>
              <th>AB率</th>
              <th>ミス率</th>
            </tr>
          </thead>
          <tbody>
            {analysis.receptionMetricRows.map((row) => (
              <tr key={row.label}>
                <td data-label="選手">{row.label}</td>
                <td data-label="本数">{row.attempts}</td>
                <td data-label="AB">{row.ab}</td>
                <td data-label="ミス">{row.errors}</td>
                <td data-label="AB率">{formatRate(row.ab, row.attempts)}</td>
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
  const blockSummary = analysis.teamPlays.filter((play) => play.skill === "B");
  const successes = blockSummary.filter((play) => play.effect === "#").length;
  const misses = blockSummary.filter((play) => play.effect === "=").length;

  return (
    <div className="analysis-block analysis-section-block">
      <h3>ブロック</h3>
      <div className="score-table-wrap">
        <table className="score-table analysis-player-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>本数</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="項目">成功</td>
              <td data-label="本数">{successes}</td>
            </tr>
            <tr>
              <td data-label="項目">ミス</td>
              <td data-label="本数">{misses}</td>
            </tr>
          </tbody>
        </table>
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
              <th>背番号</th>
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
                <td data-label="背番号">{row.player}</td>
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
          <div className="field">
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
            <div className="workspace-row-list">
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

            {activeCategory === "overview" ? <OverviewSection analysis={analysis} /> : null}
            {activeCategory === "attack" ? <AttackSection analysis={analysis} /> : null}
            {activeCategory === "serve" ? <ServeSection analysis={analysis} /> : null}
            {activeCategory === "reception" ? <ReceptionSection analysis={analysis} /> : null}
            {activeCategory === "block" ? <BlockSection analysis={analysis} /> : null}
            {activeCategory === "player" ? <PlayerSection analysis={analysis} /> : null}
          </>
        )}
      </div>
    </section>
  );
}
