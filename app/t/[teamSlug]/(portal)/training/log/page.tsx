import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TrainingLogEditor } from "@/components/training-log";
import { formatNoteDate } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamTrainingLogPath, buildTeamTrainingPath } from "@/lib/domain/team";
import { isEditableLogDate } from "@/lib/domain/training";
import { requireMember } from "@/lib/server/portal-session";
import { getTodayInJapan, listTrainingPrograms } from "@/lib/server/portal-training-store";
import {
  buildSelectionQuery,
  loadTrainingLogData,
  resolveMenuSelection,
  type MenuSelectionQuery,
} from "@/lib/server/training-log-data";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<MenuSelectionQuery & { date?: string }>;
};

export const dynamic = "force-dynamic";

/**
 * トレ録を書く画面(日付ごと)。2026-11-08 にトレーニングのページ(メニュー)から分けた。
 * ジムでやりながら開いておく画面。保存ボタンはページの最後に置く(画面には固定しない)。
 */
export default async function TeamTrainingLogPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const query = await searchParams;
  const today = getTodayInJapan();
  // 日付がなければ今日。範囲の外の日付は、黙って今日に置き換えない(違う日の欄が開いてしまうため)。
  const date = query.date === undefined ? today : query.date;
  const current = await requireMember(teamSlug, buildTeamTrainingLogPath(teamSlug, date));
  // 記録するのはプレイヤーだけ(スタッフはメニューを見るだけ)。
  if (!current.position) {
    redirect(buildTeamTrainingPath(teamSlug));
  }

  const selection = resolveMenuSelection(current, query);
  const selectionQuery = buildSelectionQuery(current, selection);
  const trainingHref = `${buildTeamTrainingPath(teamSlug)}${selectionQuery ? `?${selectionQuery}` : ""}`;
  if (!isEditableLogDate(date, today)) {
    return (
      <section className="tp-section">
        <h1>この日付の記録は、ここでは書けません</h1>
        <p className="tp-small tp-muted">
          記録を書いたり直したりできるのは、1年前から明日までの日付です
          {/^\d{4}-\d{2}-\d{2}$/.test(date) ? `(開こうとした日付:${formatNoteDate(date)})` : ""}。
        </p>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={`${trainingHref}#log`}>
            トレーニングへ戻る
          </Link>
        </div>
      </section>
    );
  }

  const programs = await listTrainingPrograms(teamSlug);
  const data = await loadTrainingLogData(teamSlug, current, selection, programs, today);

  return (
    <TrainingLogEditor
      teamSlug={teamSlug}
      memberId={current.id}
      today={today}
      initialDate={date}
      sessions={data.sessions}
      menuOptions={data.menuOptions}
      menuKeyByDate={data.menuKeyByDate}
      videoLinks={data.videoLinks}
      trainingHref={trainingHref}
    />
  );
}
