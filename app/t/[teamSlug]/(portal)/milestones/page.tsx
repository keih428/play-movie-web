import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMilestoneMonth, monthOf } from "@/lib/domain/milestones";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamHomePath, buildTeamMilestonesPath, buildTeamNotesPath } from "@/lib/domain/team";
import { getMember } from "@/lib/server/portal-member-store";
import { listMemberMilestones, listTeamMilestones } from "@/lib/server/portal-milestone-store";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ who?: string }>;
};

export const dynamic = "force-dynamic";

/**
 * 月間マイルストーンの記録(2026-10-31 から)。月ごとに、何を目標にしたかを新しい月から並べる。
 * who が無ければ自分、"team" ならチーム、部員の id ならその人(ノートの名前の横にも出しているので、部員どうしで見られる)。
 */
export default async function TeamMilestonesPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const { who } = await searchParams;
  const current = await requireMember(teamSlug, buildTeamMilestonesPath(teamSlug, who));

  const isTeam = who === "team";
  const target = isTeam ? null : who && who !== current.id ? await getMember(who) : current;
  if (!isTeam && (!target || target.teamSlug !== teamSlug)) {
    notFound();
  }
  const milestones = isTeam ? await listTeamMilestones(teamSlug) : await listMemberMilestones(target!.id);
  const thisMonth = monthOf(getTodayInJapan());
  const heading = isTeam ? "チーム" : target!.id === current.id ? "自分" : `${target!.displayName}さん`;

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">月ごとの目標の記録</span>
        <h1>{heading}のマイルストーン</h1>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={buildTeamHomePath(teamSlug)}>
            ホームへ
          </Link>
          {!isTeam && target!.id !== current.id && target!.position ? (
            <Link className="tp-button tp-ghost" href={`${buildTeamNotesPath(teamSlug)}/member?id=${target!.id}`}>
              {target!.displayName}さんのノート
            </Link>
          ) : null}
        </div>
      </header>

      <section className="tp-section">
        {milestones.length === 0 ? (
          <p className="tp-muted">まだ記録がありません。</p>
        ) : (
          <ol className="tp-milestone-log">
            {milestones.map((milestone) => (
              <li key={milestone.month}>
                <span className="tp-when">{formatMilestoneMonth(milestone.month, thisMonth)}</span>
                <span className="tp-milestone-body">{milestone.body}</span>
                {milestone.month === thisMonth ? (
                  <span className="tp-duty-badge">今月</span>
                ) : milestone.month > thisMonth ? (
                  <span className="tp-duty-badge">来月</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        <p className="tp-small tp-muted">
          今月のものは、その月のうちは書き直せます(月末の最終週からは、来月のものも先に決められます)。過去の月は、そのまま記録として残ります。
        </p>
      </section>
    </>
  );
}
