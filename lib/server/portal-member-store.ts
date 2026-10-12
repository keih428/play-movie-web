import { randomUUID } from "node:crypto";
import type { Member, MemberInput, MemberPosition, MemberRole } from "@/lib/domain/portal";
import { query, transaction } from "@/lib/server/portal-db";

type MemberRow = {
  id: string;
  team_slug: string;
  name: string;
  grade: number | null;
  position: string | null;
  is_leader: boolean;
  role: string;
  title: string | null;
  tier: string | null;
  slot: string | null;
  slack_id: string | null;
  active: boolean;
  sort_order: number;
};

export type MemberPatch = Partial<
  MemberInput & {
    tier: string | null;
    slot: string | null;
    slackId: string | null;
    active: boolean;
  }
>;

const PATCH_COLUMNS: Record<keyof MemberPatch, string> = {
  name: "name",
  grade: "grade",
  position: "position",
  isLeader: "is_leader",
  role: "role",
  title: "title",
  tier: "tier",
  slot: "slot",
  slackId: "slack_id",
  active: "active",
};

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    teamSlug: row.team_slug,
    name: row.name,
    grade: row.grade,
    position: row.position as MemberPosition | null,
    isLeader: row.is_leader,
    role: row.role as MemberRole,
    title: row.title,
    tier: row.tier,
    slot: row.slot,
    slackId: row.slack_id,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

export async function listMembers(
  teamSlug: string,
  options: { includeInactive?: boolean } = {},
): Promise<Member[]> {
  const rows = await query<MemberRow>(
    `SELECT * FROM members
     WHERE team_slug = $1 AND (active OR $2)
     ORDER BY sort_order, name`,
    [teamSlug, Boolean(options.includeInactive)],
  );
  return rows.map(toMember);
}

export async function countMembers(teamSlug: string): Promise<number> {
  const rows = await query<{ count: number }>(
    "SELECT count(*)::int AS count FROM members WHERE team_slug = $1",
    [teamSlug],
  );
  return rows[0]?.count ?? 0;
}

/** 名簿に載っているトレーニング担当(名簿とメニューを変えられる人)。 */
export async function listAdministrators(teamSlug: string): Promise<Member[]> {
  const rows = await query<MemberRow>(
    "SELECT * FROM members WHERE team_slug = $1 AND active AND role = 'training_lead'",
    [teamSlug],
  );
  return rows.map(toMember);
}

export async function getMember(memberId: string): Promise<Member | null> {
  const rows = await query<MemberRow>("SELECT * FROM members WHERE id = $1", [memberId]);
  return rows[0] ? toMember(rows[0]) : null;
}

/** 名前で突き合わせて、あれば上書き・なければ追加する。入力にない人はそのまま残す。 */
export async function upsertMembers(
  teamSlug: string,
  inputs: MemberInput[],
): Promise<{ added: number; updated: number }> {
  return transaction(async (run) => {
    const existing = await run<{ name: string }>(
      "SELECT name FROM members WHERE team_slug = $1",
      [teamSlug],
    );
    const existingNames = new Set(existing.map((row) => row.name));
    let added = 0;

    for (const [index, input] of inputs.entries()) {
      if (!existingNames.has(input.name)) {
        added += 1;
      }
      await run(
        `INSERT INTO members (id, team_slug, name, grade, position, is_leader, role, title, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (team_slug, name) DO UPDATE SET
           grade = EXCLUDED.grade,
           position = EXCLUDED.position,
           is_leader = EXCLUDED.is_leader,
           role = EXCLUDED.role,
           title = EXCLUDED.title,
           sort_order = EXCLUDED.sort_order,
           active = true,
           updated_at = now()`,
        [
          randomUUID(),
          teamSlug,
          input.name,
          input.grade,
          input.position,
          input.isLeader,
          input.role,
          input.title,
          index,
        ],
      );
    }

    return { added, updated: inputs.length - added };
  });
}

export async function createMember(teamSlug: string, input: MemberInput): Promise<Member> {
  const rows = await query<MemberRow>(
    `INSERT INTO members (id, team_slug, name, grade, position, is_leader, role, title, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
       (SELECT coalesce(max(sort_order), -1) + 1 FROM members WHERE team_slug = $2))
     RETURNING *`,
    [
      randomUUID(),
      teamSlug,
      input.name,
      input.grade,
      input.position,
      input.isLeader,
      input.role,
      input.title,
    ],
  );
  return toMember(rows[0]);
}

export async function updateMember(
  teamSlug: string,
  memberId: string,
  patch: MemberPatch,
): Promise<Member | null> {
  const keys = (Object.keys(patch) as (keyof MemberPatch)[]).filter(
    (key) => key in PATCH_COLUMNS && patch[key] !== undefined,
  );
  if (keys.length === 0) {
    return getMember(memberId);
  }

  const assignments = keys.map((key, index) => `${PATCH_COLUMNS[key]} = $${index + 3}`);
  const rows = await query<MemberRow>(
    `UPDATE members SET ${assignments.join(", ")}, updated_at = now()
     WHERE id = $1 AND team_slug = $2
     RETURNING *`,
    [memberId, teamSlug, ...keys.map((key) => patch[key])],
  );
  return rows[0] ? toMember(rows[0]) : null;
}
