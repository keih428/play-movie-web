import Link from "next/link";
import { notFound } from "next/navigation";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamTrainingPath, buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import {
  TRAINING_DAY_LABELS,
  estimate1rm,
  findWeekIndex,
  formatMonthDay,
  type LiftKind,
} from "@/lib/domain/training";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";
import {
  getTeamLatestMeasurements,
  getTeamWeek,
  getTodayInJapan,
  getTrainingMenu,
} from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    week?: string;
  }>;
};

export const dynamic = "force-dynamic";

const LIFTS: LiftKind[] = ["sq", "dl", "bp"];
// スマホの幅に収めるため、表の見出しは短い名前にする。
const LIFT_SHORT_LABELS: Record<LiftKind, string> = { sq: "SQ", dl: "DL", bp: "ベンチ" };

export default async function TeamTrainingRecordsPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamTrainingRecordsPath(teamSlug);
  await requireMember(teamSlug, basePath);
  const menu = await getTrainingMenu(teamSlug);
  if (!menu) {
    notFound();
  }

  const { week: weekKey } = await searchParams;
  const currentWeekIndex = findWeekIndex(menu, getTodayInJapan());
  const requestedWeekIndex = menu.weeks.findIndex((week) => week.k === weekKey);
  const weekIndex = requestedWeekIndex >= 0 ? requestedWeekIndex : currentWeekIndex;
  const week = menu.weeks[weekIndex];

  const [members, measurements, teamWeek] = await Promise.all([
    listMembers(teamSlug),
    getTeamLatestMeasurements(teamSlug),
    getTeamWeek(teamSlug, week.s),
  ]);
  const players = members.filter((member) => member.position);
  const names = new Map(members.map((member) => [member.id, member.name]));
  const recordedIds = new Set(teamWeek.memos.map((memo) => memo.memberId));
  const comments = teamWeek.memos.filter((memo) => memo.memo || memo.request);

  // 同じ種目を週に2回やることはないが、あった場合は重いほうを出す。
  const weights = new Map<string, number>();
  for (const log of teamWeek.lifts) {
    const key = `${log.memberId}:${log.lift}`;
    weights.set(key, Math.max(weights.get(key) ?? 0, log.weightKg));
  }

  return (
    <main className="page-shell stack">
      <section className="panel">
        <div className="panel-inner stack">
          <div className="section-heading-row">
            <div>
              <p className="portal-note">
                {week.k} ・ {formatMonthDay(week.s)}〜{formatMonthDay(week.e)}
              </p>
              <h2>みんなの記録</h2>
              <p className="portal-note">
                この週に記録した人 {recordedIds.size} / {players.length}人
              </p>
            </div>
            <Link className="button secondary" href={`${buildTeamTrainingPath(teamSlug)}?week=${week.k}`}>
              自分のメニュー
            </Link>
          </div>
          <nav className="training-weeks" aria-label="週">
            {menu.weeks.map((entry, index) => (
              <Link
                key={entry.k}
                href={`${basePath}?week=${entry.k}`}
                className={index === weekIndex ? "tab-button tab-button-active" : "tab-button"}
                aria-current={index === weekIndex ? "page" : undefined}
              >
                {entry.k}
                <small>{index === currentWeekIndex ? "今週" : `${formatMonthDay(entry.s)}〜`}</small>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">
          <h2>メイン種目の重さ</h2>
          <p className="portal-note">
            SQ = スクワット、DL = トラップバーデッドリフト。上の数字がこの週にやった重さ(kg)、下の小さい数字は推定1RM。体重比 = スクワットの推定1RM ÷ 体重。
          </p>
          <div className="score-table-wrap portal-table-wrap">
            <table className="score-table portal-table training-team-table">
              <thead>
                <tr>
                  <th>名前</th>
                  {LIFTS.map((lift) => (
                    <th key={lift}>{LIFT_SHORT_LABELS[lift]}</th>
                  ))}
                  <th>体重比</th>
                </tr>
              </thead>
              <tbody>
                {players.map((member) => {
                  const latest = measurements.get(member.id) ?? {};
                  const squat = latest.sq ? estimate1rm(latest.sq) : null;
                  const ratio = squat && latest.bw ? squat / latest.bw.value : null;
                  return (
                    <tr key={member.id}>
                      <td>
                        {member.name}
                        <span className="portal-cell-sub">
                          {[member.tier, recordedIds.has(member.id) ? null : "未記録"]
                            .filter(Boolean)
                            .join("・")}
                        </span>
                      </td>
                      {LIFTS.map((lift) => {
                        const weight = weights.get(`${member.id}:${lift}`);
                        const measurement = latest[lift];
                        return (
                          <td key={lift}>
                            {weight ?? "—"}
                            {measurement ? (
                              <span className="portal-cell-sub">
                                {Math.round(estimate1rm(measurement) * 10) / 10}
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td>
                        {ratio ? ratio.toFixed(2) : "—"}
                        {latest.bw ? <span className="portal-cell-sub">{latest.bw.value} kg</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">
          <h2>気になること・リーダーとトレーニング担当へ</h2>
          {comments.length === 0 ? <p className="portal-note">この週はまだありません。</p> : null}
          {comments.map((comment) => (
            <article key={`${comment.memberId}-${comment.day}`} className="soft-panel stack">
              <p className="portal-note">
                <b>{names.get(comment.memberId) ?? "—"}</b> ・ {TRAINING_DAY_LABELS[comment.day]}
              </p>
              {comment.memo ? <p className="training-comment">{comment.memo}</p> : null}
              {comment.request ? (
                <p className="training-comment training-comment-request">
                  <span className="tag">リーダー・トレーニング担当へ</span>
                  {comment.request}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
