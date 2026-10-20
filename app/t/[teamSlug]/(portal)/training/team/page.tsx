import Link from "next/link";
import { notFound } from "next/navigation";
import { TrainingRequestReplies } from "@/components/training-request-replies";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import { formatNoteDate } from "@/lib/domain/notes";
import {
  TRAINING_REQUEST_LABEL,
  estimate1rm,
  findWeekIndex,
  formatMonthDay,
  formatPeriod,
  getPeriodStatus,
  getProgramRange,
  pickProgram,
  summarizeSets,
  topSetKg,
  type LiftKind,
} from "@/lib/domain/training";
import { listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";
import { listRangeReplies } from "@/lib/server/portal-training-reply-store";
import {
  getTeamLatestMeasurements,
  getTodayInJapan,
  listTeamSessions,
  listTrainingPrograms,
} from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    menu?: string;
    week?: string;
    // 知らせのリンクから来たとき:その日が入る週を開く。
    date?: string;
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
  const { menu: menuKey, week: weekKey, date } = await searchParams;
  const today = getTodayInJapan();
  const programs = await listTrainingPrograms(teamSlug);
  const linkedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const linkedProgram = linkedDate
    ? programs.find((entry) => entry.menu.weeks.some((week) => linkedDate >= week.s && linkedDate <= week.e))
    : undefined;
  const program = pickProgram(programs, today, menuKey ?? linkedProgram?.key);
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
  const defaultWeekIndex = findWeekIndex(menu, linkedDate ?? today);
  const currentWeekIndex = isCurrentPeriod ? defaultWeekIndex : -1;
  const requestedWeekIndex = menu.weeks.findIndex((week) => week.k === weekKey);
  const weekIndex = requestedWeekIndex >= 0 ? requestedWeekIndex : defaultWeekIndex;
  const week = menu.weeks[weekIndex];

  const [members, measurements, sessions, replies] = await Promise.all([
    listMembers(teamSlug),
    getTeamLatestMeasurements(teamSlug),
    listTeamSessions(teamSlug, week.s, week.e),
    listRangeReplies(teamSlug, week.s, week.e),
  ]);
  const isTrainingLead = canAdminister(current);
  const players = members.filter((member) => member.position);
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  const recordedIds = new Set(sessions.map((session) => session.memberId));
  const comments = sessions.filter((session) => session.memo || session.request);

  // この週にやった一番重いセット(同じ種目を週に何回かやっていれば、重いほう)。
  const weights = new Map<string, number>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const kg = exercise.lift ? topSetKg(exercise) : null;
      if (exercise.lift && kg !== null) {
        const key = `${session.memberId}:${exercise.lift}`;
        weights.set(key, Math.max(weights.get(key) ?? 0, kg));
      }
    }
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
          SQ = スクワット、DL = トラップバーデッドリフト。上がこの週にやった一番重いセット(kg)、下の小さい数字は推定1RM。体重比
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
                        {member.displayName}
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
          <article
            key={`${comment.memberId}-${comment.date}`}
            id={`req-${comment.memberId}-${comment.date}`}
            className="tp-card tp-comment"
          >
            <div className="tp-dayhead">
              <span className="tp-when">{formatNoteDate(comment.date)}</span>
              <span className="tp-what">{names.get(comment.memberId) ?? "—"}</span>
            </div>
            {comment.exercises.length > 0 ? (
              <details className="tp-small">
                <summary>この日の記録</summary>
                <ul className="tp-log-lines">
                  {comment.exercises.map((exercise, index) => (
                    <li key={index}>
                      {exercise.name}:{summarizeSets(exercise.sets)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {comment.memo ? <p>{comment.memo}</p> : null}
            {comment.request ? (
              <>
                <p className="tp-request">
                  <b>{TRAINING_REQUEST_LABEL}</b>
                  {comment.request}
                </p>
                <TrainingRequestReplies
                  canReply={isTrainingLead || comment.memberId === current.id}
                  initialReplies={replies.filter(
                    (reply) => reply.memberId === comment.memberId && reply.sessionDate === comment.date,
                  )}
                  memberId={comment.memberId}
                  sessionDate={comment.date}
                  teamSlug={teamSlug}
                />
              </>
            ) : null}
          </article>
        ))}
      </section>
    </>
  );
}
