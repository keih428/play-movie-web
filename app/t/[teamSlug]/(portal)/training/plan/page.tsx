import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/rich-text";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamTrainingPath, buildTeamTrainingPlanPath } from "@/lib/domain/team";
import {
  formatPeriod,
  getPeriodStatus,
  type PeriodStatus,
} from "@/lib/domain/training";
import { requireMember } from "@/lib/server/portal-session";
import {
  getTodayInJapan,
  getTrainingPlan,
  listTrainingPrograms,
} from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<PeriodStatus, string> = {
  past: "終わった",
  current: "いまここ",
  upcoming: "これから",
};

/** 年間の方針と、2か月ごとの位置付け。登録してあるメニューへの入口にもなる。 */
export default async function TeamTrainingPlanPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  await requireMember(teamSlug, buildTeamTrainingPlanPath(teamSlug));
  const today = getTodayInJapan();
  const [plan, programs] = await Promise.all([
    getTrainingPlan(teamSlug),
    listTrainingPrograms(teamSlug),
  ]);

  if (!plan) {
    return (
      <section className="tp-section">
        <h2>年間の方針</h2>
        <p>年間の方針がまだ入っていません。トレーニング担当が入れるまで待ってください。</p>
      </section>
    );
  }

  const [policy, ...otherSections] = plan.sections;

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">{plan.s["小見出し"]}</span>
        <h1>{plan.s["タイトル"]}</h1>
        <p className="tp-muted">{plan.s["リード"]}</p>
      </header>

      {policy ? (
        <section className="tp-section">
          <h2>{policy[0]}</h2>
          <div className="tp-card tp-ref-body" dangerouslySetInnerHTML={{ __html: policy[1] }} />
        </section>
      ) : null}

      <section className="tp-section">
        <h2>2か月ごとの位置付け</h2>
        <ol className="tp-timeline">
          {plan.blocks.map((block) => {
            const status = getPeriodStatus(block.s, block.e, today);
            // その区切りの中で始まるメニューを、入口として並べる。
            const linked = programs.filter((program) => program.key >= block.s && program.key <= block.e);
            return (
              <li key={block.s} className={`tp-block tp-block-${status}`}>
                <div className="tp-block-head">
                  <span className="tp-k">{formatPeriod(block.s, block.e)}</span>
                  <span className="tp-block-status">{STATUS_LABELS[status]}</span>
                </div>
                <h3>{block.name}</h3>
                <p className="tp-block-role">
                  <RichText text={block.role} />
                </p>
                <dl>
                  <dt>ねらい</dt>
                  <dd>
                    <RichText text={block.aim} />
                  </dd>
                  <dt>やること</dt>
                  <dd>
                    <RichText text={block.what} />
                  </dd>
                  <dt>大会・測定</dt>
                  <dd>
                    <RichText text={block.events} />
                  </dd>
                </dl>
                {linked.length > 0 ? (
                  <div className="tp-actions">
                    {linked.map((program) => (
                      <Link
                        key={program.key}
                        className="tp-button tp-ghost"
                        href={`${buildTeamTrainingPath(teamSlug)}?menu=${program.key}`}
                      >
                        この時期のメニューを見る
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="tp-small tp-muted">メニューは、時期が近づいたら出ます。</p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {otherSections.map(([title, html]) => (
        <section key={title} className="tp-section">
          <h2>{title}</h2>
          <div className="tp-card tp-ref-body" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      ))}
    </>
  );
}
