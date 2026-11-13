import Link from "next/link";
import { notFound } from "next/navigation";
import { TrainingRequestReplies } from "@/components/training-request-replies";
import {
  MEMBER_GROUPS,
  MEMBER_GROUP_LABELS,
  canAdminister,
  canReplyTrainingRequest,
  getMemberGroup,
  isPortalTeam,
  type MemberGroup,
} from "@/lib/domain/portal";
import { buildTeamMemberTrainingPath, buildTeamTrainingPath, buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import { listThreadParticipantIds } from "@/lib/domain/mentions";
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
  weightModeOf,
  exerciseUnit,
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
    // ポジションのまとまり(side・MB・S・Li)か all。ノートと同じ切り替え(2026-11-07 から)。
    group?: string;
  }>;
};

type RecordsGroup = MemberGroup | "all";
const RECORDS_GROUPS: RecordsGroup[] = [...MEMBER_GROUPS, "all"];
const RECORDS_GROUP_LABELS: Record<RecordsGroup, string> = { ...MEMBER_GROUP_LABELS, all: "全員" };

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
  const { menu: menuKey, week: weekKey, date, group: requestedGroup } = await searchParams;
  // 開いたときは自分のまとまり(OH と OP は同じ「サイド」)。スタッフと、知らせのリンク(?date=)から来たときは全員
  // (知らせの書き込みが、ほかのまとまりの人のものでも見えるように)。
  const group: RecordsGroup = RECORDS_GROUPS.includes(requestedGroup as RecordsGroup)
    ? (requestedGroup as RecordsGroup)
    : date
      ? "all"
      : (getMemberGroup(current.position) ?? "all");
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
  const inGroup = (memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    return group === "all" || (member ? getMemberGroup(member.position) === group : false);
  };
  const players = members.filter((member) => member.position && inGroup(member.id));
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  const recordedIds = new Set(sessions.filter((session) => inGroup(session.memberId)).map((session) => session.memberId));
  // 1つの「トレーニング担当へ」に付いた返信。
  const threadOf = (memberId: string, date: string) =>
    replies.filter((reply) => reply.memberId === memberId && reply.sessionDate === date);
  const comments = sessions.filter((session) => (session.memo || session.request) && inGroup(session.memberId));
  // この週の記録(新しい日から。同じ日は名簿の順)。
  const order = new Map(members.map((member, index) => [member.id, index]));
  const groupSessions = sessions
    .filter((session) => inGroup(session.memberId) && session.exercises.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0));
  // 期間・週・まとまりを切り替えるリンク(ほかの2つはそのまま)。
  const hrefWith = (next: { menu?: string; week?: string; group?: RecordsGroup }) => {
    const params = new URLSearchParams({ menu: next.menu ?? program.key });
    if (next.week) {
      params.set("week", next.week);
    }
    params.set("group", next.group ?? group);
    return `${basePath}?${params.toString()}`;
  };

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
                href={hrefWith({ menu: entry.key })}
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
              href={hrefWith({ week: entry.k })}
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

      <div className="tp-bar" role="region" aria-label="まとまりの切り替え">
        <nav className="tp-seg tp-days" aria-label="まとまり">
          {RECORDS_GROUPS.map((entry) => (
            <Link
              key={entry}
              href={hrefWith({ week: week.k, group: entry })}
              aria-current={entry === group ? "true" : undefined}
            >
              {RECORDS_GROUP_LABELS[entry]}
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
          {group === "all" ? "" : `${RECORDS_GROUP_LABELS[group]}で `}この週に記録した人 {recordedIds.size} / {players.length}人
        </p>
      </div>

      <section className="tp-section">
        <h2>メイン種目の重さ</h2>
        <p className="tp-small tp-muted">
          SQ = スクワット、DL = トラップバーデッドリフト。上がこの週にやった一番重いセット(kg)、下の小さい数字は推定1RM。体重比
          = スクワットの推定1RM ÷ 体重。名前を押すと、その人のトレ録(日ごとの記録)を見られます。
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
                      {/* 名前を押すと、その人のトレ録(読むだけ)。自分はいつものトレ録へ(2026-11-05 から) */}
                      <Link
                        className="tp-name tp-link"
                        href={
                          member.id === current.id
                            ? buildTeamTrainingPath(teamSlug)
                            : buildTeamMemberTrainingPath(teamSlug, member.id)
                        }
                      >
                        {member.displayName}
                        {member.id === current.id ? "(自分)" : ""}
                      </Link>
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

      {/* 1回の記録ごとに、やった種目と重さ・回数・セット(2026-11-07 から。けーいちの依頼) */}
      <section className="tp-section">
        <h2>この週の記録</h2>
        {groupSessions.length === 0 ? <p className="tp-small tp-muted">この週はまだありません。</p> : null}
        <ol className="tp-log-history">
          {groupSessions.map((session) => (
            <li key={`${session.memberId}-${session.date}`} className="tp-card">
              <div className="tp-dayhead">
                <span className="tp-when">{formatNoteDate(session.date)}</span>
                <Link
                  className="tp-what tp-link"
                  href={
                    session.memberId === current.id
                      ? buildTeamTrainingPath(teamSlug)
                      : buildTeamMemberTrainingPath(teamSlug, session.memberId)
                  }
                >
                  {names.get(session.memberId) ?? "—"}
                </Link>
              </div>
              <ul className="tp-log-lines">
                {session.exercises.map((exercise, index) => (
                  <li key={index}>
                    {exercise.name}:
                    {summarizeSets(exercise.sets, weightModeOf(exercise.name), exerciseUnit(exercise))}
                  </li>
                ))}
                {session.bodyWeightKg !== null ? <li>体重:{session.bodyWeightKg}kg</li> : null}
              </ul>
            </li>
          ))}
        </ol>
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
                      {exercise.name}:{summarizeSets(exercise.sets, weightModeOf(exercise.name), exerciseUnit(exercise))}
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
                  canReply={canReplyTrainingRequest(current, {
                    ownerId: comment.memberId,
                    participantIds: listThreadParticipantIds(threadOf(comment.memberId, comment.date), members),
                  })}
                  initialReplies={threadOf(comment.memberId, comment.date)}
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
