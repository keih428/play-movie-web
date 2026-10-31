import { milestoneKey, type Milestone } from "@/lib/domain/milestones";
import { query } from "@/lib/server/portal-db";

type MilestoneRow = { member_id: string; month: string; body: string; updated_at: Date | string };

function toMilestone(row: MilestoneRow): Milestone {
  return {
    memberId: row.member_id,
    month: row.month,
    body: row.body,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** その人のその月のマイルストーン。まだ決めていなければ null。 */
export async function getMilestone(memberId: string, month: string): Promise<Milestone | null> {
  const rows = await query<MilestoneRow>(
    "SELECT member_id, month, body, updated_at FROM monthly_milestones WHERE member_id = $1 AND month = $2",
    [memberId, month],
  );
  return rows[0] ? toMilestone(rows[0]) : null;
}

/** その人のこれまでのマイルストーン(新しい月から)。 */
export async function listMemberMilestones(memberId: string): Promise<Milestone[]> {
  const rows = await query<MilestoneRow>(
    "SELECT member_id, month, body, updated_at FROM monthly_milestones WHERE member_id = $1 ORDER BY month DESC",
    [memberId],
  );
  return rows.map(toMilestone);
}

/** いくつかの月の、チーム全員のマイルストーン。キーは milestoneKey(部員, 月)。 */
export async function mapTeamMilestones(teamSlug: string, months: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(months)];
  if (unique.length === 0) {
    return {};
  }
  const rows = await query<MilestoneRow>(
    "SELECT member_id, month, body, updated_at FROM monthly_milestones WHERE team_slug = $1 AND month = ANY($2::text[])",
    [teamSlug, unique],
  );
  return Object.fromEntries(rows.map((row) => [milestoneKey(row.member_id, row.month), row.body]));
}

/** その月のマイルストーンを決める・書き直す。 */
export async function saveMilestone(teamSlug: string, memberId: string, month: string, body: string): Promise<void> {
  await query(
    `INSERT INTO monthly_milestones (team_slug, member_id, month, body) VALUES ($1, $2, $3, $4)
     ON CONFLICT (member_id, month) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
    [teamSlug, memberId, month, body],
  );
}

/** チームのその月のマイルストーン。まだ決めていなければ null。 */
export async function getTeamMilestone(teamSlug: string, month: string): Promise<Milestone | null> {
  const rows = await query<{ month: string; body: string; updated_at: Date | string }>(
    "SELECT month, body, updated_at FROM team_monthly_milestones WHERE team_slug = $1 AND month = $2",
    [teamSlug, month],
  );
  const row = rows[0];
  return row ? { memberId: null, month: row.month, body: row.body, updatedAt: new Date(row.updated_at).toISOString() } : null;
}

/** チームのこれまでのマイルストーン(新しい月から)。 */
export async function listTeamMilestones(teamSlug: string): Promise<Milestone[]> {
  const rows = await query<{ month: string; body: string; updated_at: Date | string }>(
    "SELECT month, body, updated_at FROM team_monthly_milestones WHERE team_slug = $1 ORDER BY month DESC",
    [teamSlug],
  );
  return rows.map((row) => ({ memberId: null, month: row.month, body: row.body, updatedAt: new Date(row.updated_at).toISOString() }));
}

/** チームのその月のマイルストーンを決める・書き直す(幹部だけ。確かめるのは呼び出し側)。 */
export async function saveTeamMilestone(teamSlug: string, month: string, body: string, updatedBy: string): Promise<void> {
  await query(
    `INSERT INTO team_monthly_milestones (team_slug, month, body, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (team_slug, month) DO UPDATE SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [teamSlug, month, body, updatedBy],
  );
}
