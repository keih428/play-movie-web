import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalTextSection } from "@/components/portal-text-section";
import { RoleManualCard } from "@/components/role-manual-card";
import { MANUAL_SECTIONS, ROLE_MANUALS, canEditPortalTexts, isPortalTeam, roleManualKey } from "@/lib/domain/portal";
import {
  buildTeamManualPath,
  buildTeamTrainingPath,
  buildTeamTrainingPlanPath,
  buildTeamTrainingRecordsPath,
} from "@/lib/domain/team";
import { requireMember } from "@/lib/server/portal-session";
import { listPortalTexts } from "@/lib/server/portal-text-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * データベース/マニュアル。記録する場所(トレ録・ノート・出欠)とは分けて、部の情報を読む場所をここにまとめる
 * (部員の声、2026-10-20)。中身は幹部が書いて、ここから直せる。
 */
export default async function TeamManualPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamManualPath(teamSlug));
  const texts = await listPortalTexts(teamSlug);
  const canEdit = canEditPortalTexts(current);

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">部の情報をまとめて読む</span>
        <h1>データベース/マニュアル</h1>
        <nav className="tp-chips" aria-label="目次">
          {MANUAL_SECTIONS.map((section) => (
            <a key={section.key} className="tp-chip" href={`#${section.key}`}>
              {section.title}
            </a>
          ))}
        </nav>
        {canEdit ? (
          <p className="tp-small tp-muted">
            幹部・トレーニング担当・システム担当は、見出しの「書く」「編集」から編集できます。役職ごとのマニュアルは、部員ならだれでも書けます。
          </p>
        ) : null}
      </header>

      {MANUAL_SECTIONS.map((section) => (
        <PortalTextSection
          key={section.key}
          teamSlug={teamSlug}
          textKey={section.key}
          title={section.title}
          hint={section.hint}
          body={texts[section.key]?.body ?? null}
          updatedAt={texts[section.key]?.updatedAt ?? null}
          canEdit={canEdit}
        >
          {section.key === "roles" ? (
            // 役職ごとのマニュアル(2026-11-01 から)。押すと開く。部員のだれでも「⋯」から書ける。
            <div className="tp-role-manuals">
              <p className="tp-small tp-muted">役職を押すと開きます。部員ならだれでも、右上の「⋯」から書いたり直したりできます(Markdown で書けます)。</p>
              {ROLE_MANUALS.map((role) => {
                const key = roleManualKey(role.id);
                return (
                  <RoleManualCard
                    key={key}
                    teamSlug={teamSlug}
                    textKey={key}
                    title={role.title}
                    body={texts[key]?.body ?? null}
                    updatedAt={texts[key]?.updatedAt ?? null}
                  />
                );
              })}
            </div>
          ) : null}
          {section.key === "training" ? (
            <ul className="tp-linklist">
              <li>
                <Link href={buildTeamTrainingPlanPath(teamSlug)}>年間のトレーニング方針</Link>
              </li>
              <li>
                <Link href={buildTeamTrainingPath(teamSlug)}>今週のメニューと、ルールと説明(トレ録の下)</Link>
              </li>
              <li>
                <Link href={buildTeamTrainingRecordsPath(teamSlug)}>みんなのトレーニング記録</Link>
              </li>
            </ul>
          ) : null}
        </PortalTextSection>
      ))}
    </>
  );
}
