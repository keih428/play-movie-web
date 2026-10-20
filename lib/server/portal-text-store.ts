import type { PortalTextKey } from "@/lib/domain/portal";
import { query } from "@/lib/server/portal-db";

export type PortalText = {
  body: string;
  updatedAt: string;
};

/** 部内ページの文章(ホームのチームの目標など)。まだ書かれていなければ null。 */
export async function getPortalText(teamSlug: string, key: PortalTextKey): Promise<PortalText | null> {
  const rows = await query<{ body: string; updated_at: Date | string }>(
    "SELECT body, updated_at FROM portal_texts WHERE team_slug = $1 AND key = $2",
    [teamSlug, key],
  );
  const row = rows[0];
  return row ? { body: row.body, updatedAt: new Date(row.updated_at).toISOString() } : null;
}

export async function savePortalText(teamSlug: string, key: PortalTextKey, body: string, updatedBy: string) {
  await query(
    `INSERT INTO portal_texts (team_slug, key, body, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (team_slug, key) DO UPDATE SET
       body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [teamSlug, key, body, updatedBy],
  );
}
