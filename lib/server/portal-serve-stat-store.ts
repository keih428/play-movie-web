import {
  emptyServeTally,
  isServeResult,
  parseServeSetup,
  serveAttempts,
  type ServeCount,
  type ServeResult,
  type ServeSetup,
} from "@/lib/domain/serve-stats";
import { query } from "@/lib/server/portal-db";

// サーブ効果率の集計(2026-11-10 から)。メニュー(drill_stat_drills の kind = 'serving')ごとに、
// 部員ごと・評価(# + ! - / =)ごとの本数を、旧サーブと同じ drill_stat_counts(skill = 'serve')に持つ。

type GradeRow = { member_id: string; grade: string; count: number };

/** 「部員・評価・本数」の行を、部員ごとの数にまとめる。 */
function toCounts(rows: GradeRow[]): ServeCount[] {
  const byMember = new Map<string, ServeCount>();
  for (const row of rows) {
    if (!isServeResult(row.grade)) {
      continue;
    }
    const entry = byMember.get(row.member_id) ?? { memberId: row.member_id, ...emptyServeTally() };
    entry[row.grade] += Number(row.count);
    byMember.set(row.member_id, entry);
  }
  return [...byMember.values()].filter((entry) => serveAttempts(entry) > 0);
}

export async function listServeCounts(drillId: string): Promise<ServeCount[]> {
  const rows = await query<GradeRow>(
    "SELECT member_id, grade, count FROM drill_stat_counts WHERE drill_id = $1 AND skill = 'serve' AND count > 0",
    [drillId],
  );
  return toCounts(rows);
}

/** 1本数える(delta: -1 なら取り消す。0より下にはしない)。変えたあとのその人の数を返す。 */
export async function addServeCount(input: {
  drillId: string;
  memberId: string;
  result: ServeResult;
  delta: 1 | -1;
}): Promise<ServeCount> {
  await query(
    `INSERT INTO drill_stat_counts (drill_id, member_id, skill, grade, count)
     VALUES ($1, $2, 'serve', $3, GREATEST($4, 0))
     ON CONFLICT (drill_id, member_id, skill, grade) DO UPDATE SET
       count = GREATEST(drill_stat_counts.count + $4, 0), updated_at = now()`,
    [input.drillId, input.memberId, input.result, input.delta],
  );
  const rows = await query<GradeRow>(
    "SELECT member_id, grade, count FROM drill_stat_counts WHERE drill_id = $1 AND member_id = $2 AND skill = 'serve'",
    [input.drillId, input.memberId],
  );
  return toCounts(rows)[0] ?? { memberId: input.memberId, ...emptyServeTally() };
}

/** その期間(from〜to、'YYYY-MM-DD')の、全部のサーブ効果率のメニューの合計(部員ごと)。 */
export async function sumServeCounts(teamSlug: string, from: string, to: string): Promise<ServeCount[]> {
  const rows = await query<GradeRow>(
    `SELECT c.member_id, c.grade, sum(c.count)::int AS count
     FROM drill_stat_counts c JOIN drill_stat_drills d ON d.id = c.drill_id
     WHERE d.team_slug = $1 AND d.kind = 'serving' AND c.skill = 'serve'
       AND d.practice_date >= $2 AND d.practice_date <= $3
     GROUP BY c.member_id, c.grade`,
    [teamSlug, from, to],
  );
  return toCounts(rows);
}

/** 打つ人(共有)。まだ選んでいなければ setup は null。 */
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
