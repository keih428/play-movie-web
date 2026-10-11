import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/rich-text";
import { TrainingMeasurementForm } from "@/components/training-measurement-form";
import { TrainingMenuUpload } from "@/components/training-menu-upload";
import { TrainingSession, type WeekLink } from "@/components/training-session";
import {
  MEMBER_POSITIONS,
  MEMBER_SLOTS,
  MEMBER_TIERS,
  canManageMembers,
  isMemberPosition,
  isPortalTeam,
} from "@/lib/domain/portal";
import { buildTeamTrainingPath } from "@/lib/domain/team";
import {
  FRESHMAN_GRADE,
  findWeekIndex,
  formatMonthDay,
  resolveWeek,
  type MenuSelection,
  type TrainingMenu,
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

function formatPercent(value: number | null) {
  return value === null ? "" : `${value}%`;
}

/** 「ルールと説明」。表はメニューのデータから組み立て、文章は配布版の Markdown から来る。 */
function ReferenceSections({ menu }: { menu: TrainingMenu }) {
  const loadWeeks = menu.weeks.filter((week) => week.mode === "load");
  const prose = new Map(menu.ref ?? []);
  const renderProse = (title: string) =>
    prose.has(title) ? <div dangerouslySetInnerHTML={{ __html: prose.get(title) ?? "" }} /> : null;

  const sections: { title: string; body: React.ReactNode }[] = [
    { title: "段階と目標", body: renderProse("段階と目標") },
    {
      title: "8週間の流れ",
      body: (
        <table>
          <thead>
            <tr>
              <th>週</th>
              <th>期間</th>
              <th />
              <th>内容</th>
            </tr>
          </thead>
          <tbody>
            {menu.weeks.map((week) => (
              <tr key={week.k}>
                <td className="tp-num">{week.k}</td>
                <td className="tp-num">
                  {formatMonthDay(week.s)}〜{formatMonthDay(week.e)}
                </td>
                <td>
                  <b>{week.name}</b>
                </td>
                <td>
                  <RichText text={week.desc} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      title: "重さの表",
      body: (
        <>
          <div className="tp-two">
            <table>
              <thead>
                <tr>
                  <th>週</th>
                  <th>T1・T2</th>
                  <th>重さ</th>
                  <th>きつさの目安</th>
                </tr>
              </thead>
              <tbody>
                {loadWeeks.map((week) => (
                  <tr key={week.k}>
                    <td className="tp-num">{week.k}</td>
                    <td className="tp-num">
                      {week.reps}回 × {week.sets}
                    </td>
                    <td className="tp-num">{formatPercent(week.pct)}</td>
                    <td>{week.rir}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th>週</th>
                  <th>T3(スクワット・DL)</th>
                  <th>重さ</th>
                  <th>きつさの目安</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(menu.t3).map(([key, load]) => (
                  <tr key={key}>
                    <td className="tp-num">{key}</td>
                    <td className="tp-num">
                      {load.reps}回 × {load.sets}
                    </td>
                    <td className="tp-num">{formatPercent(load.pct)}</td>
                    <td>{load.rir}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderProse("重さのルール")}
        </>
      ),
    },
    {
      title: "上半身の「個人の追加」",
      body: (
        <>
          <p>
            <RichText text={menu.upper.desc} />
          </p>
          <table>
            <thead>
              <tr>
                <th>目的</th>
                <th>種目の例</th>
              </tr>
            </thead>
            <tbody>
              {(menu.upper.addons ?? []).map(([purpose, examples]) => (
                <tr key={purpose}>
                  <td>
                    <RichText text={purpose} />
                  </td>
                  <td>
                    <RichText text={examples} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    {
      title: "体力づくり(坂道・タバタ)",
      body: (
        <>
          {renderProse("体力づくり")}
          <table>
            <thead>
              <tr>
                <th>週</th>
                <th>B の体力づくり</th>
              </tr>
            </thead>
            <tbody>
              {menu.weeks.map((week) => (
                <tr key={week.k}>
                  <td className="tp-num">{week.k}</td>
                  <td>
                    <RichText text={week.brun} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    ...[
      "1年生の国公立大会",
      "メディシンボールのメニュー",
      "メディシンボールが投げられないとき",
      "測定",
      "安全のルール",
      "食事の基本",
      "サプリ",
      "記録と面談",
    ].map((title) => ({ title, body: renderProse(title) })),
  ];

  return (
    <>
      {sections
        .filter((section) => section.body)
        .map((section) => (
          <details key={section.title} className="tp-ref">
            <summary>{section.title}</summary>
            <div className="tp-ref-body">{section.body}</div>
          </details>
        ))}
    </>
  );
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
      <section className="tp-section">
        <h2>トレーニング</h2>
        <p>
          メニューがまだ入っていません。{canManage ? "" : "トレーニング担当が入れるまで待ってください。"}
        </p>
        {canManage ? <TrainingMenuUpload teamSlug={teamSlug} /> : null}
      </section>
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
    const search = new URLSearchParams({
      week: menu!.weeks[weekIndex].k,
      ...Object.fromEntries(choices.map((choice) => [choice.key, choice.value])),
      ...overrides,
    });
    return `${basePath}?${search.toString()}`;
  }

  const latest = canRecord ? await getLatestMeasurements(current.id) : {};
  const estimated = toEstimated1rm(latest);
  const resolved = resolveWeek(menu, weekIndex, selection, estimated);
  const { week } = resolved;
  const [records, previousWeights] = canRecord
    ? await Promise.all([getWeekRecords(current.id, week.s), getPreviousWeights(current.id, week.s)])
    : [{}, {}];

  // 今週なら、今日の曜日(なければ、まだ記録していない最初の曜日)を開く。
  const recordableDays = resolved.days.filter((day) => day.items.length > 0);
  const initialDay =
    (weekIndex === currentWeekIndex
      ? (recordableDays.find((day) => day.date === today) ??
        recordableDays.find((day) => !records[day.day]))
      : undefined) ?? resolved.days[0];

  const weekLinks: WeekLink[] = menu.weeks.map((entry, index) => ({
    key: entry.k,
    href: buildHref({ week: entry.k }),
    label: index === currentWeekIndex ? "今週" : `${formatMonthDay(entry.s)}〜`,
    isCurrent: index === currentWeekIndex,
    isSelected: index === weekIndex,
  }));

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">{menu.s["小見出し"]}</span>
        <h1>{menu.s["タイトル"]}</h1>
        <div className="tp-chips">
          <span className="tp-chip">
            <b>{current.name}</b>
          </span>
          <span className="tp-chip">
            <span className={`tp-tier ${selection.tier}`}>{selection.tier}</span>
            {resolved.tierName}
          </span>
          <span className="tp-chip">{selection.slot}枠</span>
          <span className="tp-chip">{selection.position}</span>
          {selection.fresh ? <span className="tp-chip">1年生</span> : null}
        </div>
        {choices.length > 0 ? (
          <>
            <div className="tp-pick">
              {choices.map((choice) => (
                <span key={choice.key}>
                  <span className="tp-label">{choice.label}</span>
                  <span className="tp-seg">
                    {choice.values.map((value) => (
                      <Link
                        key={value}
                        href={buildHref({ [choice.key]: value })}
                        aria-current={value === choice.value ? "true" : undefined}
                        scroll={false}
                      >
                        {value}
                      </Link>
                    ))}
                  </span>
                </span>
              ))}
            </div>
            <p className="tp-small tp-muted">
              {canRecord
                ? "段階と枠は、測定のあとにトレーニング担当が名簿に入れます。それまでは自分で選んでください。"
                : "スタッフは、段階・枠・ポジションを選んでメニューを見られます(記録はしません)。"}
            </p>
          </>
        ) : null}
      </header>

      <TrainingSession
        // 測定を入れ直すと重さの目安が変わるので、欄を作り直す。
        key={`${week.k}-${selection.tier}-${selection.slot}-${selection.position}-${JSON.stringify(estimated)}`}
        canRecord={canRecord}
        days={resolved.days}
        initialDay={initialDay.day}
        previousWeights={previousWeights}
        records={records}
        teamSlug={teamSlug}
        weekLinks={weekLinks}
        weekStart={week.s}
      >
        <div className="tp-weekhead">
          <span className="tp-k">
            {week.k} ・ {formatMonthDay(week.s)}〜{formatMonthDay(week.e)}
          </span>
          <h2>{week.name}</h2>
          <p className="tp-small tp-muted">
            <RichText text={week.desc} />
          </p>
        </div>
        {resolved.notes.length > 0 ? (
          <div className="tp-section">
            {resolved.notes.map((note) => (
              <p key={note} className="tp-note">
                <RichText text={note} />
              </p>
            ))}
          </div>
        ) : null}
      </TrainingSession>

      {resolved.tierNotes.length > 0 ? (
        <section className="tp-section">
          <div className="tp-card tp-small">
            <b>{selection.tier} の注意</b>
            <ul className="tp-list">
              {resolved.tierNotes.map((note) => (
                <li key={note}>
                  <RichText text={note} />
                </li>
              ))}
            </ul>
          </div>
          <p className="tp-small tp-muted">
            <RichText text={resolved.footer} />
          </p>
        </section>
      ) : null}

      {canRecord ? (
        <section className="tp-section">
          <h2>測定の記録</h2>
          <p className="tp-small tp-muted">
            3RMと体重を測ったら、測った項目だけ入れます(今日の日付で記録)。推定1RM(3RM ×
            1.1)から、メイン種目の重さの目安が出ます。
          </p>
          <TrainingMeasurementForm latest={latest} teamSlug={teamSlug} />
        </section>
      ) : null}

      <section className="tp-section">
        <h2>ルールと説明</h2>
        <ReferenceSections menu={menu} />
      </section>

      <footer className="tp-footer">
        <p>
          トレーニング担当:{menu.s["担当者"]} ・ {menu.s["フッター"]}
        </p>
        {canManage ? (
          <details>
            <summary>メニューを入れ替える(トレーニング担当・スタッフ)</summary>
            <TrainingMenuUpload teamSlug={teamSlug} />
          </details>
        ) : null}
      </footer>
    </>
  );
}
