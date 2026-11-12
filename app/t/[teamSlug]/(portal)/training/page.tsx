import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/rich-text";
import { LiftHistory } from "@/components/lift-history";
import { TrainingMeasurementForm } from "@/components/training-measurement-form";
import { TrainingGlossary as Glossary } from "@/components/training-glossary";
import { TrainingLogHistory } from "@/components/training-log-history";
import { TrainingMenuUpload } from "@/components/training-menu-upload";
import { TrainingPersonalItems } from "@/components/training-personal-items";
import { TrainingSession, type PeriodLink, type WeekLink } from "@/components/training-session";
import {
  MEMBER_POSITIONS,
  TRAINING_GROUPS,
  toTrainingGroup,
  MEMBER_TIERS,
  canAdminister,
  isPortalTeam,
} from "@/lib/domain/portal";
import { formatNoteDate } from "@/lib/domain/notes";
import {
  buildTeamTrainingLogPath,
  buildTeamTrainingPath,
  buildTeamTrainingPlanPath,
  buildTeamTrainingRecordsPath,
} from "@/lib/domain/team";
import {
  buildLiftHistory,
  findPlanBlock,
  findWeekIndex,
  formatMonthDay,
  formatPeriod,
  getPeriodStatus,
  getProgramRange,
  pickProgram,
  resolveWeek,
  type SessionExercise,
  type TrainingMenu,
} from "@/lib/domain/training";
import { applyPersonalItems } from "@/lib/domain/personal-items";
import { listMembers } from "@/lib/server/portal-member-store";
import { listPersonalItems } from "@/lib/server/portal-personal-items-store";
import { requireMember } from "@/lib/server/portal-session";
import { listMustItems } from "@/lib/server/portal-training-must-store";
import {
  getLatestMeasurements,
  getTodayInJapan,
  listMemberMeasurements,
  getTrainingPlan,
  listMemberSessions,
  listTrainingPrograms,
  toEstimated1rm,
} from "@/lib/server/portal-training-store";
import { buildSelectionQuery, resolveMenuSelection } from "@/lib/server/training-log-data";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
  searchParams: Promise<{
    menu?: string;
    week?: string;
    tier?: string;
    slot?: string;
    pos?: string;
    // トレ録を書く画面から戻ったとき:保存した・消した日付(「保存しました」を出す)。
    saved?: string;
    deleted?: string;
  }>;
};

export const dynamic = "force-dynamic";

const isIsoDate = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** 見出し。単語帳の表示では「SECTION n」の札が付き、題も変わる。 */
function SectionHead({ no, title, tangoTitle }: { no: number; title: string; tangoTitle?: string }) {
  return (
    <div className="tp-sh">
      <span className="tp-sh-tag tp-tango-only">SECTION {no}</span>
      <h2>
        <span className="tp-std-only">{title}</span>
        <span className="tp-tango-only">{tangoTitle ?? title}</span>
      </h2>
    </div>
  );
}

const stripBold = (text: string | undefined) => (text ?? "").replace(/\*\*/g, "");

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
  const canManage = canAdminister(current);
  const query = await searchParams;
  const today = getTodayInJapan();
  const [programs, plan] = await Promise.all([
    listTrainingPrograms(teamSlug),
    getTrainingPlan(teamSlug),
  ]);
  const periods = programs.map((entry) => {
    const { start, end } = getProgramRange(entry.menu);
    return { key: entry.key, label: formatPeriod(start, end), status: getPeriodStatus(start, end, today) };
  });
  const program = pickProgram(programs, today, query.menu);

  if (!program) {
    return (
      <section className="tp-section">
        <h2>トレーニング</h2>
        <p>
          メニューがまだ入っていません。{canManage ? "" : "トレーニング担当が入れるまで待ってください。"}
        </p>
        {canManage ? <TrainingMenuUpload programs={periods} teamSlug={teamSlug} /> : null}
      </section>
    );
  }

  // 「今週」の印は、いまの期間のメニューを開いているときだけ付ける。
  const { menu } = program;
  const period = periods.find((entry) => entry.key === program.key);
  const defaultWeekIndex = findWeekIndex(menu, today);
  const currentWeekIndex = period?.status === "current" ? defaultWeekIndex : -1;
  const requestedWeekIndex = menu.weeks.findIndex((week) => week.k === query.week);
  const weekIndex = requestedWeekIndex >= 0 ? requestedWeekIndex : defaultWeekIndex;

  // 名簿で決まっている項目はそれを使う。まだ決まっていない項目だけ、画面で選べる。
  const canRecord = Boolean(current.position);
  const ownSelection = resolveMenuSelection(current, query);
  // トレーニング担当は、ほかの段階のテンプレのメニューも見られる(2026-11-10 から。見るだけで、記録は自分の段階のまま)。
  // 見ている間は、自分の推定1RMからの重さと個人の追加を入れない。
  const viewTier =
    canManage && current.tier && query.tier !== current.tier
      ? MEMBER_TIERS.find((tier) => tier === query.tier)
      : undefined;
  const selection = viewTier ? { ...ownSelection, tier: viewTier } : ownSelection;
  const choices = [
    { key: "tier", label: "段階", values: MEMBER_TIERS, value: selection.tier, fixed: Boolean(current.tier) },
    { key: "slot", label: "枠", values: TRAINING_GROUPS, value: selection.slot, fixed: Boolean(toTrainingGroup(current.slot)) },
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
      menu: program!.key,
      week: menu.weeks[weekIndex].k,
      ...Object.fromEntries(choices.map((choice) => [choice.key, choice.value])),
      ...(viewTier ? { tier: viewTier } : {}),
      ...overrides,
    });
    return `${basePath}?${search.toString()}`;
  }

  const [latest, measurements] = canRecord
    ? await Promise.all([getLatestMeasurements(current.id), listMemberMeasurements(current.id)])
    : [{}, []];
  const estimated = viewTier ? {} : toEstimated1rm(latest);
  const resolved = resolveWeek(menu, weekIndex, selection, estimated);
  const { week } = resolved;
  // 日付ごとの記録(2026-10-20 から)。書く画面は 2026-11-08 に分けた(training/log)。ここには自分の記録の一覧を出す。
  const sessions = canRecord ? await listMemberSessions(current.id) : [];
  // 個人の追加メニュー(2026-10-26 から):トレーニング担当がその人に足した種目を、メニューとトレ録の欄に入れる。
  const personalItems = canRecord && !viewTier ? await listPersonalItems(teamSlug, current.id) : [];
  const days = resolved.days.map((day) => applyPersonalItems(day, personalItems));
  const selectionQuery = buildSelectionQuery(current, ownSelection);
  const logHref = `${buildTeamTrainingLogPath(teamSlug)}${selectionQuery ? `?${selectionQuery}` : ""}`;
  const logNotice = isIsoDate(query.saved)
    ? `${formatNoteDate(query.saved)}の記録を保存しました。`
    : isIsoDate(query.deleted)
      ? `${formatNoteDate(query.deleted)}の記録を消しました。`
      : "";

  // 今週なら、今日の曜日を開く。
  const recordableDays = days.filter((day) => day.items.length > 0);
  const initialDay =
    (weekIndex === currentWeekIndex ? recordableDays.find((day) => day.date === today) : undefined) ??
    days[0];

  const weekLinks: WeekLink[] = menu.weeks.map((entry, index) => ({
    key: entry.k,
    href: buildHref({ week: entry.k }),
    label: index === currentWeekIndex ? "今週" : `${formatMonthDay(entry.s)}〜`,
    isCurrent: index === currentWeekIndex,
    isSelected: index === weekIndex,
  }));

  // 期間の切り替え。開いた期間の、今日が入る週(なければ最初か最後の週)から始まる。
  const periodLinks: PeriodLink[] = periods.map((entry) => ({
    ...entry,
    href: `${basePath}?menu=${entry.key}`,
    isSelected: entry.key === program.key,
  }));
  const block = findPlanBlock(plan, week.s);
  const mustItems = await listMustItems(teamSlug);

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow tp-std-only">{menu.s["小見出し"]}</span>
        <h1 className="tp-std-only">{menu.s["タイトル"]}</h1>
        <div className="tp-cover tp-tango-only">
          <span className="tp-band">{menu.s["単語帳の帯"]}</span>
          <span className="tp-series">{menu.s["単語帳の上の文字"]}</span>
          <p className="tp-cover-title">{menu.s["単語帳のタイトル"]}</p>
          <p className="tp-cover-en">{menu.s["単語帳の英語"]}</p>
          <div className="tp-ed">
            <span>{menu.s["単語帳の編者"]}</span>
            <span>担当 {menu.s["担当者"]}</span>
          </div>
        </div>
        <div className="tp-motto tp-tango-only">
          {["標語1", "標語2", "標語3"].map((key) => (
            <span key={key}>{stripBold(menu.s[key])}</span>
          ))}
        </div>
        <div className="tp-chips">
          <span className="tp-chip">
            <b>{current.displayName}</b>
          </span>
          <span className="tp-chip">
            <span className={`tp-tier ${selection.tier}`}>{selection.tier}</span>
            {resolved.tierName}
          </span>
          <span className="tp-chip">{selection.slot}枠</span>
          <span className="tp-chip">{selection.position}</span>
          {selection.fresh ? <span className="tp-chip">1年生</span> : null}
        </div>
        {/* ほかの部員の記録への入口(2026-11-07 から。ホームのいちばん下にしかなく、見つけにくかった) */}
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={buildTeamTrainingRecordsPath(teamSlug)}>
            みんなの記録を見る
          </Link>
        </div>
        {canManage && current.tier ? (
          <div className="tp-pick">
            <span>
              <span className="tp-label">ほかの段階を見る</span>
              <span className="tp-seg">
                {MEMBER_TIERS.map((tier) => (
                  <Link
                    key={tier}
                    href={buildHref({ tier })}
                    aria-current={tier === selection.tier ? "true" : undefined}
                    scroll={false}
                  >
                    {tier === current.tier ? `${tier}(自分)` : tier}
                  </Link>
                ))}
              </span>
            </span>
          </div>
        ) : null}
        {viewTier ? (
          <p className="tp-small tp-muted">
            {viewTier} のメニューを見ています(トレーニング担当だけ)。重さの目安(kg)と個人の追加は入れていません。記録は自分の段階({current.tier})のメニューで書きます。
          </p>
        ) : null}
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

      {canRecord ? (
        <TrainingLogHistory
          teamSlug={teamSlug}
          memberId={current.id}
          today={today}
          sessions={sessions}
          logHref={logHref}
          notice={logNotice}
        />
      ) : null}

      <TrainingSession
        key={`${program.key}-${week.k}-${selection.tier}-${selection.slot}-${selection.position}-${JSON.stringify(estimated)}`}
        teamSlug={teamSlug}
        mustItems={mustItems}
        canMarkMust={canManage}
        days={days}
        initialDay={initialDay.day}
        periodLinks={periodLinks}
        weekLinks={weekLinks}
      >
        <div className="tp-weekhead">
          <SectionHead no={1} title="今週のメニュー" tangoTitle="今週の単語" />
          <p className="tp-small tp-muted tp-tango-only">
            赤い字が今週の回数。赤シートをかけて、ジムに入る前に言えるか確かめよう。隠れた所はタップで1つずつ見える。
          </p>
          <span className="tp-k">
            {week.k} ・ {formatMonthDay(week.s)}〜{formatMonthDay(week.e)}
          </span>
          <h3 className="tp-weekname">{week.name}</h3>
          <p className="tp-small tp-muted">
            <RichText text={week.desc} />
          </p>
          {block ? (
            <Link className="tp-position" href={buildTeamTrainingPlanPath(teamSlug)}>
              <span className="tp-label">この時期の位置付け</span>
              <b>{block.name}</b>
              <span className="tp-small">
                <RichText text={block.aim} />
              </span>
              <span className="tp-position-more">年間の方針を見る →</span>
            </Link>
          ) : null}
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
          <SectionHead no={2} title="測定の記録" tangoTitle="重さを割り出す" />
          <p className="tp-small tp-muted">
            3RMと体重を測ったら、測った項目だけ入れます。max を更新したら、その日の日付で入れておくと、下の推移で伸びを追えます。推定1RM(3RM ×
            1.1)から、メイン種目の重さの目安が出ます。
          </p>
          <TrainingMeasurementForm latest={latest} teamSlug={teamSlug} today={today} />
          <h3 className="tp-small">Big3 の推移(推定1RM)</h3>
          <LiftHistory history={buildLiftHistory(measurements)} />
        </section>
      ) : null}

      {(menu.gl ?? []).length > 0 ? (
        <section className="tp-section tp-tango-only">
          <SectionHead no={3} title="必修語" />
          <p className="tp-small tp-muted">トレーニングでよく出てくる言葉。意味は赤シートで隠せます。</p>
          <Glossary entries={menu.gl ?? []} />
        </section>
      ) : null}

      <section className="tp-section">
        <SectionHead no={4} title="ルールと説明" tangoTitle="ルールと解説" />
        <ReferenceSections menu={menu} />
      </section>

      <footer className="tp-footer">
        <p>
          トレーニング担当:{menu.s["担当者"]} ・ {menu.s["フッター"]}
        </p>
        <p className="tp-tango-only">{menu.s["単語帳の断り書き"]}</p>
        {canManage ? (
          <details>
            <summary>個人の追加メニュー(トレーニング担当だけ)</summary>
            <TrainingPersonalItems
              teamSlug={teamSlug}
              members={(await listMembers(teamSlug))
                .filter((member) => member.position)
                .map(({ id, displayName }) => ({ id, displayName }))}
            />
          </details>
        ) : null}
        {canManage ? (
          <details>
            <summary>メニュー・年間の方針を入れる(トレーニング担当だけ)</summary>
            <TrainingMenuUpload programs={periods} teamSlug={teamSlug} />
          </details>
        ) : null}
      </footer>
    </>
  );
}
