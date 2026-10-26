import { query } from "@/lib/server/portal-db";

// 「これだけは欠かさないでほしい種目」の星(2026-10-25 から)。トレーニング担当がメニューの画面で付け外しする。

export async function listMustItems(teamSlug: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    "SELECT name FROM training_must_items WHERE team_slug = $1 ORDER BY name",
    [teamSlug],
  );
  return rows.map((row) => row.name);
}

export async function setMustItem(teamSlug: string, name: string, marked: boolean, markedBy: string) {
  if (marked) {
    await query(
      `INSERT INTO training_must_items (team_slug, name, marked_by) VALUES ($1, $2, $3)
       ON CONFLICT (team_slug, name) DO NOTHING`,
      [teamSlug, name, markedBy],
    );
    return;
  }
  await query("DELETE FROM training_must_items WHERE team_slug = $1 AND name = $2", [teamSlug, name]);
}
