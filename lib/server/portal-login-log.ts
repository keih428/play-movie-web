import { randomUUID } from "node:crypto";
import { query } from "@/lib/server/portal-db";
import { MEMBER_DISPLAY_NAME_SQL } from "@/lib/server/portal-member-store";

// bad_member_passphrase:部の合言葉は合っていたが、自分の合言葉が違った(2026-10-25 から)。
export type LoginResult = "ok" | "bad_passphrase" | "bad_member_passphrase" | "unknown_member" | "locked";

export type LoginLogEntry = {
  id: string;
  at: string;
  result: LoginResult;
  memberName: string | null;
  ip: string | null;
  userAgent: string | null;
  newDevice: boolean;
};

export type MemberDeviceEntry = {
  memberName: string;
  userAgent: string | null;
  lastIp: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type RequestInfo = {
  ip: string | null;
  userAgent: string | null;
};

const LOCK_WINDOW_MINUTES = 15;
export const LOCK_THRESHOLD = 5;

export async function recordLogin(input: {
  teamSlug: string;
  result: LoginResult;
  memberId?: string;
  memberName?: string;
  deviceId?: string;
  newDevice?: boolean;
  request: RequestInfo;
}) {
  await query(
    `INSERT INTO login_logs
       (id, team_slug, result, member_id, member_name, ip, user_agent, device_id, new_device)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      input.teamSlug,
      input.result,
      input.memberId ?? null,
      input.memberName ?? null,
      input.request.ip,
      input.request.userAgent,
      input.deviceId ?? null,
      Boolean(input.newDevice),
    ],
  );
}

/** 同じ IP アドレスから、直近15分に合言葉を間違えた回数。 */
export async function countRecentFailures(teamSlug: string, ip: string | null): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM login_logs
     WHERE team_slug = $1 AND result IN ('bad_passphrase', 'bad_member_passphrase')
       AND ip IS NOT DISTINCT FROM $2
       AND at > now() - make_interval(mins => $3)`,
    [teamSlug, ip, LOCK_WINDOW_MINUTES],
  );
  return rows[0]?.count ?? 0;
}

/** その部員にとって初めての端末なら登録する。ほかの端末をすでに持っていたかも返す。 */
export async function registerMemberDevice(
  memberId: string,
  deviceId: string,
  request: RequestInfo,
): Promise<{ isNew: boolean; hadOtherDevices: boolean }> {
  const known = await query<{ device_id: string }>(
    "SELECT device_id FROM member_devices WHERE member_id = $1",
    [memberId],
  );
  const isNew = !known.some((row) => row.device_id === deviceId);

  await query(
    `INSERT INTO member_devices (member_id, device_id, user_agent, last_ip)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (member_id, device_id) DO UPDATE SET
       user_agent = EXCLUDED.user_agent,
       last_ip = EXCLUDED.last_ip,
       last_seen_at = now()`,
    [memberId, deviceId, request.userAgent, request.ip],
  );

  return { isNew, hadOtherDevices: isNew && known.length > 0 };
}

/** 「最後に開いた日時」を更新する。書き込みを減らすため、1時間に1回まで。 */
export async function touchMemberDevice(memberId: string, deviceId: string, request: RequestInfo) {
  await query(
    `UPDATE member_devices SET last_seen_at = now(), last_ip = $3, user_agent = $4
     WHERE member_id = $1 AND device_id = $2
       AND last_seen_at < now() - interval '1 hour'`,
    [memberId, deviceId, request.ip, request.userAgent],
  );
}

export async function listLoginLogs(teamSlug: string, limit = 200): Promise<LoginLogEntry[]> {
  const rows = await query<{
    id: string;
    at: Date;
    result: LoginResult;
    member_name: string | null;
    ip: string | null;
    user_agent: string | null;
    new_device: boolean;
  }>(
    // 名前は、いまの名簿のもの(背番号つき)を出す。名簿にもういない人は、記録したときの名前。
    `SELECT l.id, l.at, l.result, coalesce(${MEMBER_DISPLAY_NAME_SQL}, l.member_name) AS member_name,
            l.ip, l.user_agent, l.new_device
     FROM login_logs l LEFT JOIN members m ON m.id = l.member_id
     WHERE l.team_slug = $1 ORDER BY l.at DESC LIMIT $2`,
    [teamSlug, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    result: row.result,
    memberName: row.member_name,
    ip: row.ip,
    userAgent: row.user_agent,
    newDevice: row.new_device,
  }));
}

export async function listMemberDevices(teamSlug: string): Promise<MemberDeviceEntry[]> {
  const rows = await query<{
    name: string;
    user_agent: string | null;
    last_ip: string | null;
    first_seen_at: Date;
    last_seen_at: Date;
  }>(
    `SELECT ${MEMBER_DISPLAY_NAME_SQL} AS name, d.user_agent, d.last_ip, d.first_seen_at, d.last_seen_at
     FROM member_devices d JOIN members m ON m.id = d.member_id
     WHERE m.team_slug = $1 ORDER BY d.last_seen_at DESC`,
    [teamSlug],
  );

  return rows.map((row) => ({
    memberName: row.name,
    userAgent: row.user_agent,
    lastIp: row.last_ip,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  }));
}
