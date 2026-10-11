import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/rich-text";
import { TrainingDayForm } from "@/components/training-day-form";
import { TrainingMeasurementForm } from "@/components/training-measurement-form";
import { TrainingMenuUpload } from "@/components/training-menu-upload";
import {
  MEMBER_POSITIONS,
  MEMBER_SLOTS,
  MEMBER_TIERS,
  canManageMembers,
  isMemberPosition,
  isPortalTeam,
} from "@/lib/domain/portal";
import { buildTeamTrainingPath, buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import {
  FRESHMAN_GRADE,
  findWeekIndex,
  formatMonthDay,
  resolveWeek,
  type MenuSelection,
} from "@/lib/domain/training";
import { requireMember } from "@/lib/server/portal-session";
import {
  getLatestMeasurements,
  getPreviousWeights,
  getTodayInJapan,
  getTrainingMenu,
  getWeekRecords,
  toEstimated1rm,
} from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    week?: string;
    tier?: string;
    slot?: string;
    pos?: string;
  }>;
};

export const dynamic = "force-dynamic";

function pick<T extends string>(choices: readonly T[], ...candidates: (string | null | undefined)[]): T {
  return (candidates.find((value) => choices.includes(value as T)) as T | undefined) ?? choices[0];
}

export default async function TeamTrainingPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const basePath = buildTeamTrainingPath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const canManage = canManageMembers(current.role);
  const menu = await getTrainingMenu(teamSlug);

  if (!menu) {
    return (
      <main className="page-shell stack">
        <section className="panel">
          <div className="panel-inner stack">
            <h2>トレーニング</h2>
            <p>メニューがまだ入っていません。{canManage ? "" : "トレーニング担当が入れるまで待ってください。"}</p>
            {canManage ? <TrainingMenuUpload teamSlug={teamSlug} /> : null}
          </div>
        </section>
      </main>
    );
  }

  const query = await searchParams;
  const today = getTodayInJapan();
  const currentWeekIndex = findWeekIndex(menu, today);
  const requestedWeekIndex = menu.weeks.findIndex((week) => week.k === query.week);
  const weekIndex = requestedWeekIndex >= 0 ? requestedWeekIndex : currentWeekIndex;

  // 名簿で決まっている項目はそれを使う。まだ決まっていない項目だけ、画面で選べる。
  const canRecord = Boolean(current.position);
  const selection: MenuSelection = {
    tier: pick(MEMBER_TIERS, current.tier, query.tier, "T1"),
    slot: pick(MEMBER_SLOTS, current.slot, query.slot),
    position: isMemberPosition(current.position) ? current.position : pick(MEMBER_POSITIONS, query.pos),
    fresh: current.grade === FRESHMAN_GRADE,
  };
  const choices = [
    { key: "tier", label: "段階", values: MEMBER_TIERS, value: selection.tier, fixed: Boolean(current.tier) },
    { key: "slot", label: "枠", values: MEMBER_SLOTS, value: selection.slot, fixed: Boolean(current.slot) },
    {
      key: "pos",
      label: "ポジション",
      values: MEMBER_POSITIONS,
      value: selection.position,
      fixed: Boolean(current.position),
    },
  ].filter((choice) => !choice.fixed);

  function buildHref(overrides: Record<string, string>) {
    const search = new URLSearchParams();
    const values = {
      week: menu!.weeks[weekIndex].k,
      ...Object.fromEntries(choices.map((choice) => [choice.key, choice.value])),
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      search.set(key, value);
    }
    return `${basePath}?${search.toString()}`;
  }

  const latest = canRecord ? await getLatestMeasurements(current.id) : {};
  const estimated = toEstimated1rm(latest);
  const resolved = resolveWeek(menu, weekIndex, selection, estimated);
  const { week } = resolved;
  const [records, previousWeights] = canRecord
    ? await Promise.all([getWeekRecords(current.id, week.s), getPreviousWeights(current.id, week.s)])
    : [{}, {}];

  const recordableDays = resolved.days.filter((day) => day.items.length > 0);
  const openDay =
    weekIndex === currentWeekIndex
      ? (recordableDays.find((day) => day.date === today) ??
        recordableDays.find((day) => !records[day.day]))
      : undefined;

  return (
    <main className="page-shell stack">
      <section className="panel">
        <div className="panel-inner stack">
          <div className="section-heading-row">
            <div>
              <p className="portal-note">
                {week.k} ・ {formatMonthDay(week.s)}〜{formatMonthDay(week.e)}
              </p>
              <h2>
                {week.name}
                <span className="tag training-tier-tag">{selection.tier}</span>
              </h2>
              <p className="portal-note">
                {current.name} ・ {resolved.tierName} ・ {selection.slot}枠 ・ {selection.position}
                {selection.fresh ? " ・ 1年生" : ""}
              </p>
            </div>
            <Link className="button secondary" href={`${buildTeamTrainingRecordsPath(teamSlug)}?week=${week.k}`}>
              みんなの記録
            </Link>
          </div>
          <p>
            <RichText text={week.desc} />
          </p>

          <nav className="training-weeks" aria-label="週">
            {menu.weeks.map((entry, index) => (
              <Link
                key={entry.k}
                href={buildHref({ week: entry.k })}
                className={index === weekIndex ? "tab-button tab-button-active" : "tab-button"}
                aria-current={index === weekIndex ? "page" : undefined}
              >
                {entry.k}
                <small>{index === currentWeekIndex ? "今週" : `${formatMonthDay(entry.s)}〜`}</small>
              </Link>
            ))}
          </nav>

          {choices.length > 0 ? (
            <div className="stack">
              <p className="portal-note">
                {canRecord
                  ? "段階・枠は、測定のあとにトレーニング担当が名簿に入れる。それまでは自分で選ぶ。"
                  : "スタッフは、段階・枠・ポジションを選んでメニューを見られる(記録はしない)。"}
              </p>
              {choices.map((choice) => (
                <div key={choice.key} className="training-choice">
                  <span className="field-label">{choice.label}</span>
                  <div className="tab-row">
                    {choice.values.map((value) => (
                      <Link
                        key={value}
                        href={buildHref({ [choice.key]: value })}
                        className={value === choice.value ? "tab-button tab-button-active" : "tab-button"}
                      >
                        {value}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {resolved.notes.map((note) => (
            <p key={note} className="training-note">
              <RichText text={note} />
            </p>
          ))}
        </div>
      </section>

      {canRecord ? (
        <TrainingMeasurementForm
          defaultOpen={week.mode === "intro2" || week.mode === "test"}
          latest={latest}
          teamSlug={teamSlug}
        />
      ) : null}

      {resolved.days.map((day) => (
        <TrainingDayForm
          // 測定を入れ直すと重さの目安が変わるので、欄を作り直す。
          key={`${week.k}-${day.day}-${selection.tier}-${selection.slot}-${JSON.stringify(estimated)}`}
          canRecord={canRecord}
          day={day}
          defaultOpen={day.day === openDay?.day}
          previousWeights={previousWeights}
          record={records[day.day]}
          teamSlug={teamSlug}
          weekStart={week.s}
        />
      ))}

      {resolved.tierNotes.length > 0 ? (
        <section className="panel">
          <div className="panel-inner">
            <h3>{selection.tier} の注意</h3>
            <ul className="training-notes-list">
              {resolved.tierNotes.map((note) => (
                <li key={note}>
                  <RichText text={note} />
                </li>
              ))}
            </ul>
            <p className="portal-note">
              <RichText text={resolved.footer} />
            </p>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="panel">
          <div className="panel-inner">
            <details>
              <summary>メニューを入れ替える(トレーニング担当・スタッフ)</summary>
              <div className="portal-details-body">
                <TrainingMenuUpload teamSlug={teamSlug} />
              </div>
            </details>
          </div>
        </section>
      ) : null}
    </main>
  );
}
