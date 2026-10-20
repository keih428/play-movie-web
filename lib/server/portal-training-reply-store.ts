import { randomUUID } from "node:crypto";
import type { TrainingRequestReply } from "@/lib/domain/training";
import { query } from "@/lib/server/portal-db";
import { MEMBER_DISPLAY_NAME_SQL } from "@/lib/server/portal-member-store";

type ReplyRow = {
  id: string;
  member_id: string;
  session_date: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: Date;
};

function toReply(row: ReplyRow): TrainingRequestReply {
  return {
    id: row.id,
    memberId: row.member_id,
    sessionDate: row.session_date,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const REPLY_COLUMNS = `r.id, r.member_id, r.session_date, r.author_id, ${MEMBER_DISPLAY_NAME_SQL} AS author_name, r.body, r.created_at`;

/** from〜to の記録に付いた返信(チームの部員の分)を、古い順に。 */
export async function listRangeReplies(teamSlug: string, from: string, to: string): Promise<TrainingRequestReply[]> {
  const rows = await query<ReplyRow>(
    `SELECT ${REPLY_COLUMNS}
     FROM training_request_replies r
     JOIN members m ON m.id = r.author_id
     JOIN members owner ON owner.id = r.member_id
     WHERE owner.team_slug = $1 AND r.session_date BETWEEN $2 AND $3
     ORDER BY r.created_at`,
    [teamSlug, from, to],
  );
  return rows.map(toReply);
}

/** 1つの記録(部員・日付)の返信を、古い順に。 */
export async function listSessionReplies(memberId: string, sessionDate: string): Promise<TrainingRequestReply[]> {
  const rows = await query<ReplyRow>(
    `SELECT ${REPLY_COLUMNS}
     FROM training_request_replies r
     JOIN members m ON m.id = r.author_id
     WHERE r.member_id = $1 AND r.session_date = $2
     ORDER BY r.created_at`,
    [memberId, sessionDate],
  );
  return rows.map(toReply);
}

export async function addReply(input: { memberId: string; sessionDate: string; authorId: string; body: string }) {
  // week_start・day は、日付ごとの記録にする前の列(消さずに残してある)。日付と「date」を入れておく。
  await query(
    `INSERT INTO training_request_replies (id, member_id, week_start, day, session_date, author_id, body)
     VALUES ($1, $2, $3, 'date', $3, $4, $5)`,
    [randomUUID(), input.memberId, input.sessionDate, input.authorId, input.body],
  );
}
