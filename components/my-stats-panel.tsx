"use client";

import { useState } from "react";
import { MyCourtChart } from "@/components/my-court-chart";
import Link from "next/link";
import type { MyTrend, StatFilter, StatSection } from "@/lib/domain/my-stats";

export type MyStats = {
  match: StatSection[];
  recent: StatSection[];
  recentCount: number;
  trend: MyTrend;
};

type Scope = "match" | "recent" | "trend";

/**
 * 自分の成績(この試合 / 直近の試合)。隣にチーム全体の同じ数字を出す。
 * 「この試合」の数字のうち、プレーを数えたものは押せて、そのプレーの映像に絞れる(onFocus)。
 */
export function MyStatsPanel({
  stats,
  linkBase,
  isSelf,
  focusKey,
  onFocus,
}: {
  stats: MyStats;
  linkBase: string;
  isSelf: boolean;
  focusKey: string | null;
  onFocus: (filter: StatFilter, label: string, key: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("match");
  const sections = scope === "match" ? stats.match : stats.recent;

  return (
    <section className="tp-mystats" aria-label="自分の成績">
      <div className="tp-mystats-head">
        <h2>{isSelf ? "成績" : "この人の成績"}</h2>
        <span className="tp-seg" role="group" aria-label="範囲">
          <button type="button" aria-pressed={scope === "match"} onClick={() => setScope("match")}>
            この試合
          </button>
          <button type="button" aria-pressed={scope === "recent"} onClick={() => setScope("recent")}>
            直近{stats.recentCount}試合
          </button>
          {stats.trend.rows.length > 1 ? (
            <button type="button" aria-pressed={scope === "trend"} onClick={() => setScope("trend")}>
              推移
            </button>
          ) : null}
        </span>
      </div>
      {scope === "trend" ? (
        <>
          <p className="tp-small tp-muted">試合ごとの、いちばん大事な数字(新しい順)。試合を押すと、その試合を開きます。</p>
          <div className="tp-mytrend-wrap">
            <table className="tp-mytrend">
              <thead>
                <tr>
                  <th scope="col">試合</th>
                  {stats.trend.columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.trend.rows.map((row) => (
                  <tr key={row.workspaceId}>
                    <th scope="row">
                      <Link href={`${linkBase}match=${encodeURIComponent(row.workspaceId)}`}>{row.label}</Link>
                    </th>
                    {row.values.map((value, index) => (
                      <td key={index}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {scope === "trend" ? null : scope === "match" ? (
        <p className="tp-small tp-muted">数字を押すと、そのプレーだけを映像で見られます。右の小さな数字はチーム全体。</p>
      ) : (
        <p className="tp-small tp-muted">直近{stats.recentCount}試合の合計。右の小さな数字は、同じ試合のチーム全体。</p>
      )}

      {scope !== "trend" && sections.length === 0 ? (
        <p className="tp-small tp-muted">数えられるプレーがありません。</p>
      ) : null}
      {(scope === "trend" ? [] : sections).map((section) => (
        <div key={section.key} className="tp-mystats-section">
          <h3>{section.title}</h3>
          <div className="tp-mystats-grid">
            {section.items.map((item) => {
              const key = `${section.key}:${item.label}`;
              const clickable = scope === "match" && item.filter;
              const body = (
                <>
                  <span className="tp-mystats-label">{item.label}</span>
                  <span className="tp-mystats-value">
                    <b>{item.value}</b>
                    {item.team ? <small>チーム {item.team}</small> : null}
                  </span>
                </>
              );
              return clickable ? (
                <button
                  key={key}
                  type="button"
                  className="tp-mystats-item"
                  aria-pressed={focusKey === key}
                  onClick={() => onFocus(item.filter!, `${section.title} ${item.label}`, key)}
                >
                  {body}
                </button>
              ) : (
                <div key={key} className="tp-mystats-item">
                  {body}
                </div>
              );
            })}
          </div>
          {section.courses ? (
            <div className="tp-mystats-courses">
              <span className="tp-label">コース</span>
              {section.courses.map((course) => {
                const key = `${section.key}:course:${course.course}`;
                const total = section.courses!.reduce((sum, entry) => sum + entry.attempts, 0);
                const share = total ? Math.round((course.attempts / total) * 100) : 0;
                const content = (
                  <>
                    <span>{course.label}</span>
                    <span className="tp-mystats-bar" style={{ width: `${share}%` }} aria-hidden="true" />
                    <small>
                      {course.attempts}本(決定 {course.kills})
                    </small>
                  </>
                );
                return scope === "match" && course.attempts > 0 ? (
                  <button
                    key={key}
                    type="button"
                    className="tp-mystats-course"
                    aria-pressed={focusKey === key}
                    onClick={() => onFocus(course.filter, `アタック ${course.label}`, key)}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={key} className="tp-mystats-course">
                    {content}
                  </div>
                );
              })}
            </div>
          ) : null}
          {section.lines ? (
            <details className="tp-mycourt-wrap" open={section.key === "attack"}>
              <summary>コートの図({section.lines.length}本)</summary>
              <MyCourtChart lines={section.lines} label={section.title} />
            </details>
          ) : null}
        </div>
      ))}
    </section>
  );
}
