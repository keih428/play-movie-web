import Link from "next/link";
import { notFound } from "next/navigation";
import { MyPlaysClient } from "@/components/my-plays-client";
import { NoteComments } from "@/components/note-comments";
import { normalizeShirtNumber } from "@/lib/domain/my-plays";
import { buildMyStats, buildMyTrend } from "@/lib/domain/my-stats";
import { NOTE_TEAM_MESSAGE_LABEL, formatNoteDate, isNoteWritten } from "@/lib/domain/notes";
import { isPortalTeam } from "@/lib/domain/portal";
import { buildTeamMyPlaysPath, buildTeamNotesPath, buildWorkspacePath } from "@/lib/domain/team";
import { listMemberMatches } from "@/lib/server/my-plays";
import { listMembers } from "@/lib/server/portal-member-store";
import { getNoteByDate, listComments } from "@/lib/server/portal-note-store";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ match?: string; member?: string }>;
};

export const dynamic = "force-dynamic";

// 成績の「直近の試合」の数(総合分析の初期値と同じ)。
const RECENT_MATCHES = 5;
// 推移の表に出す試合の数。
const TREND_MATCHES = 8;

/**
 * 上のメニューの「試合」(マイプレー、2026-10-24 から)。開くと、直近の試合の自分のプレーがすぐ出る。
 * 前の試合は、上の選択から選ぶ。ほかの部員も選べ(2026-10-26 から。初めは自分)、
 * 選んだ部員のその試合の日のノートに、ここからコメントできる。
 */
export default async function MyPlaysPage({ params, searchParams }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }
  const basePath = buildTeamMyPlaysPath(teamSlug);
  const current = await requireMember(teamSlug, basePath);
  const { match: requested, member: requestedMember } = await searchParams;

  // 選べる部員:背番号が数字の人(試合のデータは背番号で選手を見分けるため)。初めは自分。
  const players = (await listMembers(teamSlug)).filter((member) => normalizeShirtNumber(member.number));
  const target =
    players.find((member) => member.id === requestedMember) ??
    players.find((member) => member.id === current.id) ??
    players[0];
  const isSelf = target?.id === current.id;
  const number = target ? normalizeShirtNumber(target.number) : null;
  const memberOptions = players.map((member) => ({ id: member.id, label: member.displayName }));
  // 試合を選ぶリンクの頭(ほかの部員を見ているときは、その人を保つ)。
  const linkBase = isSelf || !target ? `${basePath}?` : `${basePath}?member=${target.id}&`;

  const header = (
    <header className="tp-hero">
      <span className="tp-eyebrow">{isSelf ? "自分のプレーの映像" : `${target?.displayName ?? ""}のプレーの映像`}</span>
      <h1>試合</h1>
    </header>
  );
  const memberPicker =
    memberOptions.length > 0 && target ? (
      <form className="tp-inputs tp-member-pick" method="get" action={basePath}>
        <div className="tp-field">
          <label htmlFor="myplays-member">部員</label>
          <select id="myplays-member" name="member" defaultValue={target.id}>
            {memberOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.id === current.id ? "(自分)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="tp-field">
          <span>&nbsp;</span>
          <button className="tp-button tp-ghost" type="submit">
            見る
          </button>
        </div>
      </form>
    ) : null;

  if (!target || !number) {
    return (
      <>
        {header}
        <p className="tp-message">背番号が数字の部員がいません(試合のデータは背番号で選手を見分けるため)。</p>
      </>
    );
  }

  const matches = await listMemberMatches(teamSlug, number);
  if (matches.length === 0) {
    return (
      <>
        {header}
        {memberPicker}
        <p className="tp-message">まだ、背番号 {number} のプレーが入った試合はありません。</p>
      </>
    );
  }

  const selected = matches.find((entry) => entry.workspaceId === requested) ?? matches[0];
  // 成績:この試合と、直近の試合(新しい順に RECENT_MATCHES 試合)。並びはポジションで変える。
  const position = target.position ?? null;
  const recent = matches.slice(0, RECENT_MATCHES);
  const stats = {
    match: buildMyStats({ matches: [selected], number, position }),
    recent: buildMyStats({ matches: recent, number, position }),
    recentCount: recent.length,
    trend: buildMyTrend({
      matches: matches.slice(0, TREND_MATCHES).map((entry) => ({
        ...entry,
        label: `${entry.date ? formatNoteDate(entry.date.slice(0, 10)) : "日付なし"} vs ${entry.opponent}`,
      })),
      number,
      position,
    }),
  };
  // 試合の日のノートを、自分の数字を入れた下書きで開く(その日のノートがまだなければ)。
  const noteHref = isSelf && current.position && selected.date
    ? `${buildTeamNotesPath(teamSlug)}/write?date=${selected.date.slice(0, 10)}&match=${encodeURIComponent(selected.workspaceId)}`
    : null;
  const options = matches.map((entry) => ({
    workspaceId: entry.workspaceId,
    label: `${entry.date ? formatNoteDate(entry.date.slice(0, 10)) : "日付なし"} vs ${entry.opponent}(${entry.setScore.own}-${entry.setScore.opponent})`,
  }));

  // 選んだ部員の、その試合の日のノート(なければ、書いていない日としてコメントできる)。
  const noteDate = selected.date?.slice(0, 10) ?? null;
  const note = noteDate && target.position ? await getNoteByDate(target.id, noteDate) : null;
  const noteComments = note ? await listComments([note.id]) : [];

  return (
    <>
      {header}
      {memberPicker}
      <MyPlaysClient
        key={selected.workspaceId}
        basePath={basePath}
        options={options}
        selectedId={selected.workspaceId}
        isLatest={selected === matches[0]}
        match={selected.match}
        settings={selected.record.settings}
        side={selected.side}
        number={number}
        opponent={selected.opponent}
        setScore={selected.setScore}
        stats={stats}
        noteHref={noteHref}
        linkBase={linkBase}
        isSelf={isSelf}
      />
      {noteDate && target.position ? (
        <section className="tp-section tp-myplays-notes" aria-label="この試合の日のノート">
          <h2>
            {isSelf ? "自分" : target.displayName}の{formatNoteDate(noteDate)}のノート
          </h2>
          <article className={`tp-card tp-notecard${isNoteWritten(note) ? "" : " tp-note-unwritten"}`}>
            {note && isNoteWritten(note) ? (
              <>
                <p className="tp-note-body">{note.body}</p>
                {note.request ? (
                  <p className="tp-request">
                    <b>リーダーへ</b>
                    {note.request}
                  </p>
                ) : null}
                {note.teamMessage ? (
                  <p className="tp-request tp-team-message">
                    <b>{NOTE_TEAM_MESSAGE_LABEL}</b>
                    {note.teamMessage}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="tp-small tp-muted">まだ書いていません。{isSelf ? "" : "コメントを付けると、本人に知らせます。"}</p>
            )}
            <NoteComments
              compact
              initialComments={noteComments}
              noteId={note?.id ?? null}
              day={{ memberId: target.id, date: noteDate }}
              teamSlug={teamSlug}
            />
          </article>
        </section>
      ) : null}
      <p className="tp-small tp-muted">
        チーム全体の映像と分析は{" "}
        <Link href={buildWorkspacePath({ workspaceId: selected.workspaceId, teamSlug })}>試合ビューア</Link> で見られます。
      </p>
    </>
  );
}
