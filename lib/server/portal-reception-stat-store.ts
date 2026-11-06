import { parseReceptionSetup, type ReceptionCount, type ReceptionSetup } from "@/lib/domain/reception-stats";
import { query } from "@/lib/server/portal-db";

// レセプションの集計(2026-11-06 から)。メニュー(drill_stat_drills の kind = 'reception')ごとに、
// 部員ごとの ABパスの数と受けた数を持つ。

type ReceptionRow = { member_id: string; passes: number; attempts: number };

const toCount = (row: ReceptionRow): ReceptionCount => ({
  memberId: row.member_id,
  passes: Number(row.passes),
  attempts: Number(row.attempts),
});

export async function listReceptionCounts(drillId: string): Promise<ReceptionCount[]> {
  const rows = await query<ReceptionRow>(
    "SELECT member_id, passes, attempts FROM reception_stat_counts WHERE drill_id = $1 AND attempts > 0",
    [drillId],
  );
  return rows.map(toCount);
}

/**
 * 1本数える(ABパスならABパスと受けた数を、それ以外なら受けた数だけを +1。delta: -1 なら取り消す)。
 * 0より下にはせず、ABパスが受けた数を超えないようにする。変えたあとの数を返す。
 */
export async function addReceptionCount(input: {
  drillId: string;
  memberId: string;
  pass: boolean;
  delta: 1 | -1;
}): Promise<{ passes: number; attempts: number }> {
  const passDelta = input.pass ? input.delta : 0;
  const rows = await query<{ passes: number; attempts: number }>(
    `INSERT INTO reception_stat_counts (drill_id, member_id, passes, attempts)
     VALUES ($1, $2, GREATEST($3, 0), GREATEST($4, 0))
     ON CONFLICT (drill_id, member_id) DO UPDATE SET
       passes = LEAST(GREATEST(reception_stat_counts.passes + $3, 0), GREATEST(reception_stat_counts.attempts + $4, 0)),
       attempts = GREATEST(reception_stat_counts.attempts + $4, 0),
       updated_at = now()
     RETURNING passes, attempts`,
    [input.drillId, input.memberId, passDelta, input.delta],
  );
  return { passes: Number(rows[0]?.passes ?? 0), attempts: Number(rows[0]?.attempts ?? 0) };
}

/** その期間(from〜to、'YYYY-MM-DD')の、全部のレセプションのメニューの合計(部員ごと)。 */
export async function sumReceptionCounts(teamSlug: string, from: string, to: string): Promise<ReceptionCount[]> {
  const rows = await query<ReceptionRow>(
    `SELECT r.member_id, sum(r.passes)::int AS passes, sum(r.attempts)::int AS attempts
     FROM reception_stat_counts r JOIN drill_stat_drills d ON d.id = r.drill_id
     WHERE d.team_slug = $1 AND d.practice_date >= $2 AND d.practice_date <= $3
     GROUP BY r.member_id
     HAVING sum(r.attempts) > 0`,
    [teamSlug, from, to],
  );
  return rows.map(toCount);
}

/** 受ける人の選び方(共有)。まだ選んでいなければ setup は null。 */
export async function getReceptionSetup(
  drillId: string,
): Promise<{ setup: ReceptionSetup | null; savedAt: string | null }> {
  const rows = await query<{ reception_setup: string | null; reception_setup_at: Date | string | null }>(
    "SELECT reception_setup, reception_setup_at FROM drill_stat_drills WHERE id = $1",
    [drillId],
  );
  const row = rows[0];
  let setup: ReceptionSetup | null = null;
  try {
    setup = row?.reception_setup ? parseReceptionSetup(JSON.parse(row.reception_setup)) : null;
  } catch {
    setup = null;
  }
  return { setup, savedAt: row?.reception_setup_at ? new Date(row.reception_setup_at).toISOString() : null };
}

/** 受ける人の選び方を保存する(あとから保存したものが勝つ)。保存した時刻を返す。 */
export async function saveReceptionSetup(drillId: string, setup: ReceptionSetup): Promise<string> {
  const rows = await query<{ reception_setup_at: Date | string }>(
    "UPDATE drill_stat_drills SET reception_setup = $2, reception_setup_at = now() WHERE id = $1 RETURNING reception_setup_at",
    [drillId, JSON.stringify(setup)],
  );
  return new Date(rows[0]?.reception_setup_at ?? Date.now()).toISOString();
}
