import Link from "next/link";
import { notFound } from "next/navigation";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import {
  TRAINING_DAY_LABELS,
  estimate1rm,
  findWeekIndex,
  formatMonthDay,
  formatPeriod,
  getPeriodStatus,
  getProgramRange,
  pickProgram,
  type LiftKind,
} from "@/lib/domain/training";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";
import {
  getTeamLatestMeasurements,
  getTeamWeek,
  getTodayInJapan,
  listTrainingPrograms,
} from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    menu?: string;
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
  const current = await requireMember(teamSlug, basePath);
  const { menu: menuKey, week: weekKey } = await searchParams;
  const today = getTodayInJapan();
  const programs = await listTrainingPrograms(teamSlug);
  const program = pickProgram(programs, today, menuKey);
  if (!program) {
    notFound();
  }

  const { menu } = program;
  const periods = programs.map((entry) => {
    const { start, end } = getProgramRange(entry.menu);
    return {
      key: entry.key,
      label: formatPeriod(start, end),
      status: getPeriodStatus(start, end, today),
    };
  });
  const isCurrentPeriod = periods.find((entry) => entry.key === program.key)?.status === "current";
  const defaultWeekIndex = findWeekIndex(menu, today);
  const currentWeekIndex = isCurrentPeriod ? defaultWeekIndex : -1;
  const requestedWeekIndex = menu.weeks.findIndex((week) => week.k === weekKey);
  const weekIndex = requestedWeekIndex >= 0 ? requestedWeekIndex : defaultWeekIndex;
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
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">{menu.s["小見出し"]}</span>
        <h1>みんなの記録</h1>
      </header>

      <div className="tp-bar" role="region" aria-label="週の切り替え">
        {periods.length > 1 ? (
          <nav className="tp-weeks tp-periods" aria-label="期間">
            {periods.map((entry) => (
              <Link
                key={entry.key}
                href={`${basePath}?menu=${entry.key}`}
                aria-current={entry.key === program.key ? "page" : undefined}
              >
                <b>{entry.label}</b>
                <span className={entry.status === "current" ? "tp-now" : undefined}>
                  {{ past: "これまで", current: "いま", upcoming: "これから" }[entry.status]}
                </span>
              </Link>
            ))}
          </nav>
        ) : null}
        <nav className="tp-weeks" aria-label="週">
          {menu.weeks.map((entry, index) => (
            <Link
              key={entry.k}
              href={`${basePath}?menu=${program.key}&week=${entry.k}`}
              aria-current={index === weekIndex ? "page" : undefined}
            >
              <b>{entry.k}</b>
              <span className={index === currentWeekIndex ? "tp-now" : undefined}>
                {index === currentWeekIndex ? "今週" : `${formatMonthDay(entry.s)}〜`}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="tp-weekhead">
        <span className="tp-k">
          {week.k} ・ {formatMonthDay(week.s)}〜{formatMonthDay(week.e)}
        </span>
        <h2>{week.name}</h2>
        <p className="tp-small tp-muted">
          この週に記録した人 {recordedIds.size} / {players.length}人
        </p>
      </div>

      <section className="tp-section">
        <h2>メイン種目の重さ</h2>
        <p className="tp-small tp-muted">
          SQ = スクワット、DL = トラップバーデッドリフト。上がこの週にやった重さ(kg)、下の小さい数字は推定1RM。体重比
          = スクワットの推定1RM ÷ 体重。
        </p>
        <div className="tp-card tp-scroll">
          <table className="tp-team">
            <thead>
              <tr>
                <th>名前</th>
                {LIFTS.map((lift) => (
                  <th key={lift} className="tp-num">
                    {LIFT_SHORT_LABELS[lift]}
                  </th>
                ))}
                <th className="tp-num">体重比</th>
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
                      <span className="tp-name">
                        {member.name}
                        {member.id === current.id ? "(自分)" : ""}
                      </span>
                      <span className="tp-sub">
                        {member.tier ? <span className={`tp-tier ${member.tier}`}>{member.tier}</span> : null}{" "}
                        {recordedIds.has(member.id) ? "" : "未記録"}
                      </span>
                    </td>
                    {LIFTS.map((lift) => {
                      const weight = weights.get(`${member.id}:${lift}`);
                      const measurement = latest[lift];
                      return (
                        <td key={lift} className="tp-num">
                          <span className="tp-big">{weight ?? "—"}</span>
                          {measurement ? (
                            <span className="tp-sub">{Math.round(estimate1rm(measurement) * 10) / 10}</span>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="tp-num">
                      <span className="tp-big">{ratio ? ratio.toFixed(2) : "—"}</span>
                      {latest.bw ? <span className="tp-sub">{latest.bw.value} kg</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tp-section">
        <h2>書かれたこと</h2>
        {comments.length === 0 ? <p className="tp-small tp-muted">この週はまだありません。</p> : null}
        {comments.map((comment) => (
          <article key={`${comment.memberId}-${comment.day}`} className="tp-card tp-comment">
            <div className="tp-dayhead">
              <span className="tp-when">{TRAINING_DAY_LABELS[comment.day]}</span>
              <span className="tp-what">{names.get(comment.memberId) ?? "—"}</span>
            </div>
            {comment.memo ? <p>{comment.memo}</p> : null}
            {comment.request ? (
              <p className="tp-request">
                <b>リーダー・トレーニング担当へ</b>
                {comment.request}
              </p>
            ) : null}
          </article>
        ))}
      </section>
    </>
  );
}
