import {
  parseSpikeSetup,
  type LevelSession,
  type ServeLevel,
  type SpikeCount,
  type SpikeLevel,
  type SpikeSetup,
  type SpikeSpot,
} from "@/lib/domain/spike-stats";
import { query } from "@/lib/server/portal-db";

// スパイク練習の集計(2026-11-06 から)。メニュー(drill_stat_drills の kind = 'spike')ごとに、
// 部員・セッター・位置・サーブのレベルごとの決定数と打数を持つ。

type SpikeCountRow = {
  member_id: string;
  setter_id: string;
  spot: SpikeSpot;
  level: number;
  kills: number;
  attempts: number;
};

function toSpikeCount(row: SpikeCountRow): SpikeCount {
  return {
    memberId: row.member_id,
    setterId: row.setter_id,
    spot: row.spot,
    level: Number(row.level) as SpikeLevel,
    kills: Number(row.kills),
    attempts: Number(row.attempts),
  };
}

export async function listSpikeCounts(drillId: string): Promise<SpikeCount[]> {
  const rows = await query<SpikeCountRow>(
    `SELECT member_id, setter_id, spot, level, kills, attempts FROM spike_stat_counts
     WHERE drill_id = $1 AND attempts > 0`,
    [drillId],
  );
  return rows.map(toSpikeCount);
}

/**
 * 1本数える(決定なら決定と打数を、ミスなら打数だけを +1。delta: -1 なら取り消す)。
 * 0より下にはせず、決定が打数を超えないようにする。変えたあとの決定数と打数を返す。
 */
export async function addSpikeCount(input: {
  drillId: string;
  memberId: string;
  setterId: string;
  spot: SpikeSpot;
  level: SpikeLevel;
  kill: boolean;
  delta: 1 | -1;
}): Promise<{ kills: number; attempts: number }> {
  const killDelta = input.kill ? input.delta : 0;
  const rows = await query<{ kills: number; attempts: number }>(
    `INSERT INTO spike_stat_counts (drill_id, member_id, setter_id, spot, level, kills, attempts)
     VALUES ($1, $2, $3, $4, $5, GREATEST($6, 0), GREATEST($7, 0))
     ON CONFLICT (drill_id, member_id, setter_id, spot, level) DO UPDATE SET
       kills = LEAST(GREATEST(spike_stat_counts.kills + $6, 0), GREATEST(spike_stat_counts.attempts + $7, 0)),
       attempts = GREATEST(spike_stat_counts.attempts + $7, 0),
       updated_at = now()
     RETURNING kills, attempts`,
    [input.drillId, input.memberId, input.setterId, input.spot, input.level, killDelta, input.delta],
  );
  return { kills: Number(rows[0]?.kills ?? 0), attempts: Number(rows[0]?.attempts ?? 0) };
}

/** その期間(from〜to、'YYYY-MM-DD')の、全部のスパイクのメニューの合計。 */
export async function sumSpikeCounts(teamSlug: string, from: string, to: string): Promise<SpikeCount[]> {
  const rows = await query<SpikeCountRow>(
    `SELECT s.member_id, s.setter_id, s.spot, s.level, sum(s.kills)::int AS kills, sum(s.attempts)::int AS attempts
     FROM spike_stat_counts s JOIN drill_stat_drills d ON d.id = s.drill_id
     WHERE d.team_slug = $1 AND d.practice_date >= $2 AND d.practice_date <= $3
     GROUP BY s.member_id, s.setter_id, s.spot, s.level
     HAVING sum(s.attempts) > 0`,
    [teamSlug, from, to],
  );
  return rows.map(toSpikeCount);
}

/**
 * このメニューより前の練習の、サーブありの位置(OH・OP)のレベルごとの合計(部員ごと、新しい順)。
 * 昇格の判定(2回連続)と、次に数えるときのレベルの初期値に使う。
 */
export async function listLevelSessions(
  teamSlug: string,
  drill: { id: string; practiceDate: string; createdAt: string },
): Promise<Map<string, LevelSession[]>> {
  const rows = await query<{ member_id: string; level: number; kills: number; attempts: number }>(
    `SELECT s.member_id, s.level, sum(s.kills)::int AS kills, sum(s.attempts)::int AS attempts
     FROM spike_stat_counts s JOIN drill_stat_drills d ON d.id = s.drill_id
     WHERE d.team_slug = $1 AND d.id <> $2 AND s.level > 0
       AND (d.practice_date < $3 OR (d.practice_date = $3 AND d.created_at < $4))
     GROUP BY s.member_id, d.id, d.practice_date, d.created_at, s.level
     HAVING sum(s.attempts) > 0
     ORDER BY d.practice_date DESC, d.created_at DESC`,
    [teamSlug, drill.id, drill.practiceDate, drill.createdAt],
  );
  const sessions = new Map<string, LevelSession[]>();
  for (const row of rows) {
    const list = sessions.get(row.member_id) ?? [];
    list.push({ level: Number(row.level) as ServeLevel, kills: Number(row.kills), attempts: Number(row.attempts) });
    sessions.set(row.member_id, list);
  }
  return sessions;
}

/** メニューの組み方(共有)。まだ組んでいなければ setup は null。 */
export async function getSpikeSetup(drillId: string): Promise<{ setup: SpikeSetup | null; savedAt: string | null }> {
  const rows = await query<{ spike_setup: string | null; spike_setup_at: Date | string | null }>(
    "SELECT spike_setup, spike_setup_at FROM drill_stat_drills WHERE id = $1",
    [drillId],
  );
  const row = rows[0];
  let setup: SpikeSetup | null = null;
  try {
    setup = row?.spike_setup ? parseSpikeSetup(JSON.parse(row.spike_setup)) : null;
  } catch {
    setup = null;
  }
  return { setup, savedAt: row?.spike_setup_at ? new Date(row.spike_setup_at).toISOString() : null };
}

/** 組み方を保存する(あとから保存したものが勝つ)。保存した時刻を返す。 */
export async function saveSpikeSetup(drillId: string, setup: SpikeSetup): Promise<string> {
  const rows = await query<{ spike_setup_at: Date | string }>(
    `UPDATE drill_stat_drills SET spike_setup = $2, spike_setup_at = now() WHERE id = $1 RETURNING spike_setup_at`,
    [drillId, JSON.stringify(setup)],
  );
  return new Date(rows[0]?.spike_setup_at ?? Date.now()).toISOString();
}
