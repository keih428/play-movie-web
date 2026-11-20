import { randomUUID } from "node:crypto";
import type { Note, NoteComment, PracticeDayOverride } from "@/lib/domain/notes";
import {
  getMemberGroup,
  type Member,
  type MemberGroup,
  type MemberPosition,
} from "@/lib/domain/portal";
import { query, transaction } from "@/lib/server/portal-db";
import { MEMBER_DISPLAY_NAME_SQL } from "@/lib/server/portal-member-store";

type NoteRow = {
  id: string;
  member_id: string;
  member_name: string;
  practice_date: string;
  position: string | null;
  group_key: string | null;
  body: string;
  request: string;
  team_message: string;
  photo_ids: string[];
  updated_at: Date;
  comment_count: number;
};

const NOTE_SELECT = `
  SELECT n.id, n.member_id, ${MEMBER_DISPLAY_NAME_SQL} AS member_name, n.practice_date, n.position, n.group_key,
         n.body, n.request, n.team_message, n.photo_ids, n.updated_at,
         (SELECT count(*) FROM note_comments c WHERE c.note_id = n.id)::int AS comment_count
  FROM notes n JOIN members m ON m.id = n.member_id`;

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    practiceDate: row.practice_date,
    position: row.position as MemberPosition | null,
    group: row.group_key as MemberGroup | null,
    body: row.body,
    request: row.request,
    teamMessage: row.team_message,
    photoIds: row.photo_ids ?? [],
    updatedAt: row.updated_at.toISOString(),
    commentCount: row.comment_count,
  };
}

export async function getNote(teamSlug: string, noteId: string): Promise<Note | null> {
  const rows = await query<NoteRow>(`${NOTE_SELECT} WHERE n.team_slug = $1 AND n.id = $2`, [
    teamSlug,
    noteId,
  ]);
  return rows[0] ? toNote(rows[0]) : null;
}

export async function getNoteByDate(memberId: string, practiceDate: string): Promise<Note | null> {
  const rows = await query<NoteRow>(
    `${NOTE_SELECT} WHERE n.member_id = $1 AND n.practice_date = $2`,
    [memberId, practiceDate],
  );
  return rows[0] ? toNote(rows[0]) : null;
}

/** 新しい練習日から順に。まとまり・部員・月(YYYY-MM)で絞れる。 */
export async function listNotes(
  teamSlug: string,
  filter: {
    group?: MemberGroup;
    memberId?: string;
    month?: string;
    from?: string;
    limit?: number;
    // 「チームへ」を書いたノートだけ
    teamOnly?: boolean;
  } = {},
): Promise<Note[]> {
  const rows = await query<NoteRow>(
    `${NOTE_SELECT}
     WHERE n.team_slug = $1
       AND ($2::text IS NULL OR n.group_key = $2)
       AND ($3::text IS NULL OR n.member_id = $3)
       AND ($4::text IS NULL OR n.practice_date LIKE $4 || '-%')
       AND ($5::text IS NULL OR n.practice_date >= $5)
       AND (NOT $7::boolean OR n.team_message <> '')
     ORDER BY n.practice_date DESC, n.updated_at DESC
     LIMIT $6`,
    [
      teamSlug,
      filter.group ?? null,
      filter.memberId ?? null,
      filter.month ?? null,
      filter.from ?? null,
      filter.limit ?? 500,
      filter.teamOnly ?? false,
    ],
  );
  return rows.map(toNote);
}

/**
 * その日のノートを書く(あれば書き直す)。「リーダーへ」が新しく書かれたか・変わったかも返す
 * (同じ内容で保存し直しただけのときは、リーダーに知らせない)。
 */
export async function saveNote(input: {
  member: Member;
  practiceDate: string;
  body: string;
  request: string;
  teamMessage: string;
  photoIds: string[];
}): Promise<{ note: Note; requestChanged: boolean; created: boolean }> {
  const existing = await getNoteByDate(input.member.id, input.practiceDate);
  await query(
    `INSERT INTO notes (id, team_slug, member_id, practice_date, position, group_key, body, request, team_message, photo_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (member_id, practice_date) DO UPDATE SET
       body = EXCLUDED.body, request = EXCLUDED.request, team_message = EXCLUDED.team_message,
       photo_ids = EXCLUDED.photo_ids, updated_at = now()`,
    [
      randomUUID(),
      input.member.teamSlug,
      input.member.id,
      input.practiceDate,
      input.member.position,
      getMemberGroup(input.member.position),
      input.body,
      input.request,
      input.teamMessage,
      JSON.stringify(input.photoIds),
    ],
  );
  const note = await getNoteByDate(input.member.id, input.practiceDate);
  return {
    note: note!,
    requestChanged: Boolean(input.request) && input.request !== (existing?.request ?? ""),
    // コメントだけ付いていた空のノートに、初めて書いたときも「新しく書いた」とする(コメント当番に知らせるため)。
    created: !existing || !existing.body.trim(),
  };
}

/**
 * その人・その日のノートを返す。なければ本文が空のノートを作る(書いていない日にコメントを付けるため、2026-10-26 から)。
 */
export async function ensureNote(member: Member, practiceDate: string): Promise<Note> {
  await query(
    `INSERT INTO notes (id, team_slug, member_id, practice_date, position, group_key, body, request)
     VALUES ($1, $2, $3, $4, $5, $6, '', '')
     ON CONFLICT (member_id, practice_date) DO NOTHING`,
    [randomUUID(), member.teamSlug, member.id, practiceDate, member.position, getMemberGroup(member.position)],
  );
  return (await getNoteByDate(member.id, practiceDate))!;
}

/** ノートと、それに付いたコメントを消す。 */
export async function deleteNote(noteId: string) {
  await transaction(async (run) => {
    await run("DELETE FROM note_comments WHERE note_id = $1", [noteId]);
    await run("DELETE FROM notes WHERE id = $1", [noteId]);
  });
}

export async function listComments(noteIds: string[]): Promise<NoteComment[]> {
  if (noteIds.length === 0) {
    return [];
  }
  const rows = await query<{
    id: string;
    note_id: string;
    member_id: string;
    member_name: string;
    member_number: string | null;
    body: string;
    photo_ids: string[];
    created_at: Date;
  }>(
    `SELECT c.id, c.note_id, c.member_id, ${MEMBER_DISPLAY_NAME_SQL} AS member_name, m.number AS member_number,
            c.body, c.photo_ids, c.created_at
     FROM note_comments c JOIN members m ON m.id = c.member_id
     WHERE c.note_id = ANY($1::text[])
     ORDER BY c.created_at`,
    [noteIds],
  );
  return rows.map((row) => ({
    id: row.id,
    noteId: row.note_id,
    memberId: row.member_id,
    memberName: row.member_name,
    memberNumber: row.member_number,
    body: row.body,
    photoIds: row.photo_ids ?? [],
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function addComment(noteId: string, memberId: string, body: string, photoIds: string[] = []) {
  await query(
    "INSERT INTO note_comments (id, note_id, member_id, body, photo_ids) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [randomUUID(), noteId, memberId, body, JSON.stringify(photoIds)],
  );
}

/** 自分のノートを開いたら、そこまでのコメントを「読んだ」ことにする。 */
export async function markNoteSeen(noteId: string, memberId: string) {
  await query("UPDATE notes SET author_seen_at = now() WHERE id = $1 AND member_id = $2", [
    noteId,
    memberId,
  ]);
}

/** 自分のノートに付いた、まだ読んでいないコメントの数(ノートごと)。 */
export async function getUnreadCounts(memberId: string): Promise<Record<string, number>> {
  const rows = await query<{ note_id: string; count: number }>(
    `SELECT c.note_id, count(*)::int AS count
     FROM note_comments c JOIN notes n ON n.id = c.note_id
     WHERE n.member_id = $1 AND c.member_id <> $1 AND c.created_at > n.author_seen_at
     GROUP BY c.note_id`,
    [memberId],
  );
  return Object.fromEntries(rows.map((row) => [row.note_id, row.count]));
}

export async function listPracticeDayOverrides(teamSlug: string): Promise<PracticeDayOverride[]> {
  const rows = await query<{ practice_date: string; kind: "off" | "extra" }>(
    "SELECT practice_date, kind FROM practice_day_overrides WHERE team_slug = $1 ORDER BY practice_date DESC",
    [teamSlug],
  );
  return rows.map((row) => ({ date: row.practice_date, kind: row.kind }));
}

/** kind が null なら例外を取り消して、いつもの曜日の決まりに戻す。 */
export async function setPracticeDayOverride(
  teamSlug: string,
  practiceDate: string,
  kind: "off" | "extra" | null,
) {
  if (kind === null) {
    await query("DELETE FROM practice_day_overrides WHERE team_slug = $1 AND practice_date = $2", [
      teamSlug,
      practiceDate,
    ]);
    return;
  }
  await query(
    `INSERT INTO practice_day_overrides (team_slug, practice_date, kind) VALUES ($1, $2, $3)
     ON CONFLICT (team_slug, practice_date) DO UPDATE SET kind = EXCLUDED.kind`,
    [teamSlug, practiceDate, kind],
  );
}
