import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiftHistory } from "@/components/lift-history";
import { formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamMemberTrainingPath, buildTeamTrainingPath, buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import { TRAINING_REQUEST_LABEL, buildLiftHistory, exerciseUnit, summarizeSets, weightModeOf } from "@/lib/domain/training";
import { getMember, listMembers } from "@/lib/server/portal-member-store";
import { requireMember } from "@/lib/server/portal-session";
import { listMemberMeasurements, listMemberSessions } from "@/lib/server/portal-training-store";
import { LinkedText } from "@/components/linked-text";

type PageProps = {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ id?: string; more?: string }>;
};

export const dynamic = "force-dynamic";

// はじめは新しい順に20日ぶん。「さらに前を見る」で20日ずつ。
const STEP = 20;

/**
 * ほかの部員のトレーニング録(読むだけ。けーいちの依頼、2026-11-05:「他の人のトレーニング録を見られるように」)。
 * 「みんなの記録」の名前から開く。自分を選んだときは、いつものトレ録へ。
 */
export default async function MemberTrainingPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const { id, more } = await searchParams;
  const current = await requireMember(teamSlug, buildTeamMemberTrainingPath(teamSlug, id ?? ""));
  if (!id || id === current.id) {
    redirect(buildTeamTrainingPath(teamSlug));
  }
  const target = await getMember(id);
  if (!target || target.teamSlug !== teamSlug || !target.position) {
    notFound();
  }

  const parsed = Number.parseInt(more ?? "", 10);
  const shown = Number.isFinite(parsed) ? Math.min(240, Math.max(STEP, parsed)) : STEP;
  const [sessions, members, measurements] = await Promise.all([
    listMemberSessions(target.id, shown + 1),
    listMembers(teamSlug),
    listMemberMeasurements(target.id),
  ]);
  const players = members.filter((member) => member.position && member.id !== current.id);

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">
          {target.displayName} ・ {target.position}
          {target.tier ? ` ・ ${target.tier}` : ""}
        </span>
        <h1>{target.displayName}のトレ録</h1>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={buildTeamTrainingRecordsPath(teamSlug)}>
            みんなの記録へ
          </Link>
        </div>
      </header>

      {/* ほかの人に切り替える */}
      <form className="tp-inputs tp-member-pick" method="get" action={`/t/${teamSlug}/training/member`}>
        <div className="tp-field">
          <label htmlFor="training-member">ほかの部員のトレ録を見る</label>
          <select id="training-member" name="id" defaultValue={target.id}>
            {players.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}({member.position})
              </option>
            ))}
          </select>
        </div>
        <div className="tp-field">
          <span>&nbsp;</span>
          <button className="tp-button tp-ghost" type="submit">
            開く
          </button>
        </div>
      </form>

      {/* Big3 の推移(2026-11-12 から。重さの記録は全員に見える決まりなので、ほかの部員の分も見られる) */}
      <section className="tp-section">
        <h2>Big3 の推移(推定1RM)</h2>
        <LiftHistory history={buildLiftHistory(measurements)} />
      </section>

      <section className="tp-section">
        {sessions.length === 0 ? (
          <p className="tp-small tp-muted">まだ記録はありません。</p>
        ) : (
          <ol className="tp-log-history">
            {sessions.slice(0, shown).map((session) => (
              <li key={session.date} className="tp-card">
                <div className="tp-log-histhead">
                  <b>【{formatNoteDate(session.date)}】</b>
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
                {session.memo ? <p className="tp-small tp-muted"><LinkedText text={session.memo} /></p> : null}
                {session.request ? (
                  <p className="tp-small tp-request">
                    {TRAINING_REQUEST_LABEL}:<LinkedText text={session.request} />
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {sessions.length > shown ? (
          <p className="tp-small">
            <Link className="tp-link" href={`${buildTeamMemberTrainingPath(teamSlug, target.id)}&more=${shown + STEP}`} scroll={false}>
              さらに前を見る
            </Link>
          </p>
        ) : null}
      </section>
    </>
  );
}
