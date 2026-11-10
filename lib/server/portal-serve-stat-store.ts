import { parseServeSetup, type ServeCount, type ServeResult, type ServeSetup } from "@/lib/domain/serve-stats";
import { query } from "@/lib/server/portal-db";

// サーブ効果率の集計(2026-11-10 から)。メニュー(drill_stat_drills の kind = 'serving')ごとに、
// 部員ごとのエース・効果・入った・ミスの数を持つ。

type ServeRow = { member_id: string; aces: number; effects: number; ins: number; misses: number };

const toCount = (row: ServeRow): ServeCount => ({
  memberId: row.member_id,
  ace: Number(row.aces),
  effect: Number(row.effects),
  in: Number(row.ins),
  miss: Number(row.misses),
});

// 結果ごとの列(決まった名前だけを SQL に入れる)。
const COLUMNS: Record<ServeResult, string> = {
  ace: "aces",
  effect: "effects",
  in: "ins",
  miss: "misses",
};

export async function listServeCounts(drillId: string): Promise<ServeCount[]> {
  const rows = await query<ServeRow>(
    `SELECT member_id, aces, effects, ins, misses FROM serve_stat_counts
     WHERE drill_id = $1 AND aces + effects + ins + misses > 0`,
    [drillId],
  );
  return rows.map(toCount);
}

/** 1本数える(delta: -1 なら取り消す。0より下にはしない)。変えたあとのその人の数を返す。 */
export async function addServeCount(input: {
  drillId: string;
  memberId: string;
  result: ServeResult;
  delta: 1 | -1;
}): Promise<ServeCount> {
  const column = COLUMNS[input.result];
  const rows = await query<ServeRow>(
    `INSERT INTO serve_stat_counts (drill_id, member_id, ${column})
     VALUES ($1, $2, GREATEST($3, 0))
     ON CONFLICT (drill_id, member_id) DO UPDATE SET
       ${column} = GREATEST(serve_stat_counts.${column} + $3, 0),
       updated_at = now()
     RETURNING member_id, aces, effects, ins, misses`,
    [input.drillId, input.memberId, input.delta],
  );
  return rows[0] ? toCount(rows[0]) : { memberId: input.memberId, ace: 0, effect: 0, in: 0, miss: 0 };
}

/** その期間(from〜to、'YYYY-MM-DD')の、全部のサーブのメニューの合計(部員ごと)。 */
export async function sumServeCounts(teamSlug: string, from: string, to: string): Promise<ServeCount[]> {
  const rows = await query<ServeRow>(
    `SELECT v.member_id, sum(v.aces)::int AS aces, sum(v.effects)::int AS effects,
       sum(v.ins)::int AS ins, sum(v.misses)::int AS misses
     FROM serve_stat_counts v JOIN drill_stat_drills d ON d.id = v.drill_id
     WHERE d.team_slug = $1 AND d.practice_date >= $2 AND d.practice_date <= $3
     GROUP BY v.member_id
     HAVING sum(v.aces + v.effects + v.ins + v.misses) > 0`,
    [teamSlug, from, to],
  );
  return rows.map(toCount);
}

/** 前半・後半の組み方(共有)。まだ組んでいなければ setup は null。 */
export async function getServeSetup(drillId: string): Promise<{ setup: ServeSetup | null; savedAt: string | null }> {
  const rows = await query<{ serve_setup: string | null; serve_setup_at: Date | string | null }>(
    "SELECT serve_setup, serve_setup_at FROM drill_stat_drills WHERE id = $1",
    [drillId],
  );
  const row = rows[0];
  let setup: ServeSetup | null = null;
  try {
    setup = row?.serve_setup ? parseServeSetup(JSON.parse(row.serve_setup)) : null;
  } catch {
    setup = null;
  }
  return { setup, savedAt: row?.serve_setup_at ? new Date(row.serve_setup_at).toISOString() : null };
}

/** 組み方を保存する(あとから保存したものが勝つ)。保存した時刻を返す。 */
export async function saveServeSetup(drillId: string, setup: ServeSetup): Promise<string> {
  const rows = await query<{ serve_setup_at: Date | string }>(
    "UPDATE drill_stat_drills SET serve_setup = $2, serve_setup_at = now() WHERE id = $1 RETURNING serve_setup_at",
    [drillId, JSON.stringify(setup)],
  );
  return new Date(rows[0]?.serve_setup_at ?? Date.now()).toISOString();
}
