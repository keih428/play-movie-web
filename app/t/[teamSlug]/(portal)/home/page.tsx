import Link from "next/link";
import { notFound } from "next/navigation";
import { MilestoneCard } from "@/components/milestone-card";
import { PortalGoal } from "@/components/portal-goal";
import { RichText } from "@/components/rich-text";
import { DEFAULT_PRACTICE_LOCATION } from "@/lib/domain/calendar";
import { formatMilestoneMonth, monthOf } from "@/lib/domain/milestones";
import { formatNoteDate } from "@/lib/domain/notes";
import { MANUAL_SECTIONS, canEditPortalTexts, canSetTeamMilestone, isPortalTeam } from "@/lib/domain/portal";
import {
  buildTeamAccountPath,
  buildTeamAttendancePath,
  buildTeamHomePath,
  buildTeamManualPath,
  buildTeamMembersPath,
  buildTeamMilestonesPath,
  buildTeamNotesPath,
  buildTeamSchedulePath,
  buildTeamTrainingPath,
  buildTeamTrainingPlanPath,
  buildTeamTrainingRecordsPath,
  buildTeamVideosPath,
  buildTeamWorkspacesPath,
} from "@/lib/domain/team";
import { formatPeriod } from "@/lib/domain/training";
import { getWeekDuties } from "@/lib/server/portal-comment-duty-store";
import { listMembers } from "@/lib/server/portal-member-store";
import { getMilestone, getTeamMilestone } from "@/lib/server/portal-milestone-store";
import { getUnreadCounts } from "@/lib/server/portal-note-store";
import { getPracticeSchedule } from "@/lib/server/portal-calendar";
import { requireMember } from "@/lib/server/portal-session";
import { listPortalTexts } from "@/lib/server/portal-text-store";
import { getTodayInJapan, getTrainingPlan } from "@/lib/server/portal-training-store";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

// 直近の予定を、今日から何日先まで探すか。
const UPCOMING_DAYS = 21;
const UPCOMING_LIMIT = 4;

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * 部内ページのホーム(ポータル)。「とりあえずここを見れば部の情報にアクセスできる」ようにする(部員の声、2026-10-20)。
 * チームの目標を一番上に大きく出し、いまのトレーニングの時期、直近の予定、各ページへの入口を並べる。
 */
export default async function TeamPortalHomePage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamHomePath(teamSlug));
  const today = getTodayInJapan();
  const month = monthOf(today);

  const [texts, plan, schedule, unread, duties, members, teamMilestone, myMilestone] = await Promise.all([
    listPortalTexts(teamSlug),
    getTrainingPlan(teamSlug),
    getPracticeSchedule(teamSlug, today, shiftDate(today, UPCOMING_DAYS)),
    getUnreadCounts(current.id),
    current.position ? getWeekDuties(teamSlug, today) : Promise.resolve([]),
    listMembers(teamSlug),
    getTeamMilestone(teamSlug, month),
    getMilestone(current.id, month),
  ]);
  // コメント当番:今週、自分が受け持つ人(プレイヤーだけ)。
  const dutyTarget = members.find(
    (member) => member.id === duties.find((pair) => pair.commenterId === current.id)?.targetId,
  );
  const unreadNotes = Object.values(unread).reduce((total, count) => total + count, 0);
  const goal = texts.goal;
  const manualPath = buildTeamManualPath(teamSlug);
  const period = plan?.blocks.find((block) => block.s <= today && today <= block.e) ?? null;
  // カレンダーから読めたときだけ予定の名前が分かる。読めないときは練習日だけを並べる。
  const upcoming = [...schedule.dates].sort().slice(0, UPCOMING_LIMIT);

  const mainLinks = [
    { href: buildTeamTrainingPath(teamSlug), label: "トレ録", text: "今週のメニューと、重さの記録" },
    {
      href: buildTeamNotesPath(teamSlug),
      label: "ノート",
      text: unreadNotes ? `新しいコメントが ${unreadNotes} 件` : "バレーノートを書く・読む",
    },
    { href: buildTeamAttendancePath(teamSlug), label: "出欠", text: "遅刻・早退・欠席の連絡" },
    { href: buildTeamSchedulePath(teamSlug), label: "予定", text: "練習・試合の日程" },
  ];
  const otherLinks = [
    { href: buildTeamTrainingPlanPath(teamSlug), label: "年間のトレーニング方針" },
    { href: buildTeamTrainingRecordsPath(teamSlug), label: "みんなのトレーニング記録" },
    { href: buildTeamMembersPath(teamSlug), label: "名簿" },
    { href: buildTeamWorkspacesPath(teamSlug), label: "試合の映像と分析" },
    { href: buildTeamVideosPath(teamSlug), label: "動画ライブラリ" },
  ];

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">東大バレー部</span>
        <h1>ホーム</h1>
        <p className="tp-muted">{current.displayName} さん、おつかれさまです。</p>
      </header>

      {current.hasPassphrase ? null : (
        // もうログインしている人は、ログイン直後の「決めよう」を通らないので、ここで知らせる(2026-10-25 から)。
        <p className="tp-message">
          自分の合言葉を決めると、ほかの人があなたの名前で入れなくなります。{" "}
          <Link href={`${buildTeamAccountPath(teamSlug)}?setup=1&next=${encodeURIComponent(buildTeamHomePath(teamSlug))}`}>
            決める
          </Link>
        </p>
      )}

      <section className="tp-section">
        <PortalGoal teamSlug={teamSlug} body={goal?.body ?? null} canEdit={canEditPortalTexts(current)} />
      </section>

      {/* 月間マイルストーン(2026-10-31 から)。チームは幹部が、個人は各自が、月の初めに決める。 */}
      <section className="tp-section tp-milestones">
        <MilestoneCard
          teamSlug={teamSlug}
          scope="team"
          month={month}
          monthLabel={formatMilestoneMonth(month)}
          body={teamMilestone?.body ?? null}
          canEdit={canSetTeamMilestone(current)}
          historyHref={buildTeamMilestonesPath(teamSlug, "team")}
        />
        <MilestoneCard
          teamSlug={teamSlug}
          month={month}
          monthLabel={formatMilestoneMonth(month)}
          body={myMilestone?.body ?? null}
          canEdit
          historyHref={buildTeamMilestonesPath(teamSlug)}
        />
      </section>

      {dutyTarget ? (
        <section className="tp-section">
          <Link className="tp-card tp-card-link tp-duty" href={buildTeamNotesPath(teamSlug)}>
            <span className="tp-eyebrow">今週のコメント当番</span>
            <span>
              <b>{dutyTarget.displayName}</b> さんのノートにコメントする →
            </span>
          </Link>
        </section>
      ) : null}

      <section className="tp-section">
        <h2>メインのページ</h2>
        <div className="tp-tiles">
          {mainLinks.map((link) => (
            <Link key={link.href} className="tp-tile" href={link.href}>
              <strong>{link.label}</strong>
              <span>{link.text}</span>
            </Link>
          ))}
        </div>
      </section>

      {period ? (
        <section className="tp-section">
          <h2>いまのトレーニング</h2>
          <Link className="tp-card tp-card-link" href={buildTeamTrainingPlanPath(teamSlug)}>
            <span className="tp-muted tp-small">{formatPeriod(period.s, period.e)}</span>
            <strong>{period.name}</strong>
            <p>
              <RichText text={period.aim} />
            </p>
          </Link>
        </section>
      ) : null}

      <section className="tp-section">
        <h2>直近の予定</h2>
        {upcoming.length ? (
          <ul className="tp-upcoming">
            {upcoming.map((date) => {
              const events = schedule.eventsByDate[date] ?? [];
              return (
                <li key={date}>
                  <span className="tp-upcoming-date">{formatNoteDate(date)}</span>
                  <span>
                    {events.length
                      ? events.map((event) => (
                          <span key={`${event.title}-${event.start}`} className="tp-upcoming-event">
                            {event.title}
                            {event.start ? ` ${event.start}〜${event.end ?? ""}` : ""}
                            <span className="tp-muted">({event.location ?? DEFAULT_PRACTICE_LOCATION})</span>
                          </span>
                        ))
                      : "練習"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="tp-muted">{UPCOMING_DAYS}日先までに予定はありません。</p>
        )}
        <Link className="tp-more" href={buildTeamSchedulePath(teamSlug)}>
          カレンダーを見る →
        </Link>
      </section>

      <section className="tp-section">
        <h2>データベース/マニュアル</h2>
        <ul className="tp-linklist tp-manual-index">
          {MANUAL_SECTIONS.map((section) => (
            <li key={section.key}>
              <Link href={`${manualPath}#${section.key}`}>{section.title}</Link>
              {texts[section.key] ? null : <span className="tp-small tp-muted">まだ書かれていません</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="tp-section">
        <h2>ほかのページ</h2>
        <ul className="tp-linklist">
          {otherLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
