import { randomUUID } from "node:crypto";
import type { TrainingDay, TrainingRequestReply } from "@/lib/domain/training";
import { query } from "@/lib/server/portal-db";
import { MEMBER_DISPLAY_NAME_SQL } from "@/lib/server/portal-member-store";

type ReplyRow = {
  id: string;
  member_id: string;
  day: TrainingDay;
  author_id: string;
  author_name: string;
  body: string;
  created_at: Date;
};

function toReply(row: ReplyRow): TrainingRequestReply {
  return {
    id: row.id,
    memberId: row.member_id,
    day: row.day,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

/** その週の返信(チームの部員の分)を、古い順に。 */
export async function listWeekReplies(teamSlug: string, weekStart: string): Promise<TrainingRequestReply[]> {
  const rows = await query<ReplyRow>(
    `SELECT r.id, r.member_id, r.day, r.author_id, ${MEMBER_DISPLAY_NAME_SQL} AS author_name, r.body, r.created_at
     FROM training_request_replies r
     JOIN members m ON m.id = r.author_id
     JOIN members owner ON owner.id = r.member_id
     WHERE owner.team_slug = $1 AND r.week_start = $2
     ORDER BY r.created_at`,
    [teamSlug, weekStart],
  );
  return rows.map(toReply);
}

/** 1つの記録(部員・週・曜日)の返信を、古い順に。 */
export async function listDayReplies(
  memberId: string,
  weekStart: string,
  day: TrainingDay,
): Promise<TrainingRequestReply[]> {
  const rows = await query<ReplyRow>(
    `SELECT r.id, r.member_id, r.day, r.author_id, ${MEMBER_DISPLAY_NAME_SQL} AS author_name, r.body, r.created_at
     FROM training_request_replies r
     JOIN members m ON m.id = r.author_id
     WHERE r.member_id = $1 AND r.week_start = $2 AND r.day = $3
     ORDER BY r.created_at`,
    [memberId, weekStart, day],
  );
  return rows.map(toReply);
}

export async function addReply(input: {
  memberId: string;
  weekStart: string;
  day: TrainingDay;
  authorId: string;
  body: string;
}) {
  await query(
    `INSERT INTO training_request_replies (id, member_id, week_start, day, author_id, body)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), input.memberId, input.weekStart, input.day, input.authorId, input.body],
  );
}
