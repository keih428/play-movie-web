import { randomUUID } from "node:crypto";
import { normalizePersonalDays, type PersonalItem } from "@/lib/domain/personal-items";
import { query } from "@/lib/server/portal-db";

// 個人の追加メニュー(2026-10-26 から)。足すのも消すのもトレーニング担当。見えるのは本人とトレーニング担当だけ。

type Row = {
  id: string;
  name: string;
  dose: string;
  tip: string;
  days: string;
  weighted: boolean;
};

function toItem(row: Row): PersonalItem {
  return {
    id: row.id,
    name: row.name,
    dose: row.dose,
    tip: row.tip,
    days: normalizePersonalDays(row.days.split(",")),
    weighted: row.weighted,
  };
}

export async function listPersonalItems(teamSlug: string, memberId: string): Promise<PersonalItem[]> {
  const rows = await query<Row>(
    `SELECT id, name, dose, tip, days, weighted FROM personal_menu_items
     WHERE team_slug = $1 AND member_id = $2
     ORDER BY created_at, id`,
    [teamSlug, memberId],
  );
  return rows.map(toItem);
}

export async function countPersonalItems(teamSlug: string, memberId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    "SELECT count(*)::int AS count FROM personal_menu_items WHERE team_slug = $1 AND member_id = $2",
    [teamSlug, memberId],
  );
  return rows[0]?.count ?? 0;
}

export async function addPersonalItem(
  teamSlug: string,
  memberId: string,
  item: Omit<PersonalItem, "id">,
  createdBy: string,
): Promise<void> {
  await query(
    `INSERT INTO personal_menu_items (id, team_slug, member_id, name, dose, tip, days, weighted, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomUUID(), teamSlug, memberId, item.name, item.dose, item.tip, item.days.join(","), item.weighted, createdBy],
  );
}

/** 消した種目の持ち主(なければ null)。 */
export async function deletePersonalItem(teamSlug: string, id: string): Promise<string | null> {
  const rows = await query<{ member_id: string }>(
    "DELETE FROM personal_menu_items WHERE team_slug = $1 AND id = $2 RETURNING member_id",
    [teamSlug, id],
  );
  return rows[0]?.member_id ?? null;
}
