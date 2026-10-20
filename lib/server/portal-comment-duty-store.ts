import { buildCommentDuties, getDutyWeekStart, type CommentDutyPair } from "@/lib/domain/comment-duty";
import { query, transaction } from "@/lib/server/portal-db";
import { listMembers } from "@/lib/server/portal-member-store";

function previousWeek(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

async function readDuties(teamSlug: string, weekStart: string): Promise<CommentDutyPair[]> {
  const rows = await query<{ commenter_id: string; target_id: string }>(
    "SELECT commenter_id, target_id FROM comment_duties WHERE team_slug = $1 AND week_start = $2",
    [teamSlug, weekStart],
  );
  return rows.map((row) => ({ commenterId: row.commenter_id, targetId: row.target_id }));
}

/**
 * その日が入る週のコメント当番。まだ作っていなければ、いまのプレイヤー(ポジションのある人)で作って残す。
 * 前の週と同じ相手にはしない。
 */
export async function getWeekDuties(teamSlug: string, today: string): Promise<CommentDutyPair[]> {
  const weekStart = getDutyWeekStart(today);
  const existing = await readDuties(teamSlug, weekStart);
  if (existing.length > 0) {
    return existing;
  }

  const players = (await listMembers(teamSlug)).filter((member) => member.position);
  const previous = await readDuties(teamSlug, previousWeek(weekStart));
  const pairs = buildCommentDuties(
    players.map((member) => member.id),
    previous,
  );
  if (pairs.length === 0) {
    return [];
  }

  await transaction(async (run) => {
    // 同じときに2つ開かれても、印を先に立てた1回だけが組を書き込む。
    const claimed = await run<{ week_start: string }>(
      `INSERT INTO comment_duty_weeks (team_slug, week_start) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING week_start`,
      [teamSlug, weekStart],
    );
    if (claimed.length === 0) {
      return;
    }
    for (const pair of pairs) {
      await run(
        "INSERT INTO comment_duties (team_slug, week_start, commenter_id, target_id) VALUES ($1, $2, $3, $4)",
        [teamSlug, weekStart, pair.commenterId, pair.targetId],
      );
    }
  });
  return readDuties(teamSlug, weekStart);
}
