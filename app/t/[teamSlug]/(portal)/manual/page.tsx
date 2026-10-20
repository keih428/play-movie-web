import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalTextSection } from "@/components/portal-text-section";
import { MANUAL_SECTIONS, canEditPortalTexts, isPortalTeam } from "@/lib/domain/portal";
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
            幹部・トレーニング担当・システム担当は、見出しの「書く」「編集」から編集できます。
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
