import { randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/server/portal-db";

export type ShareLinkKind = "schedule";

// 32バイト(base64url で43文字)。総当たりでは見つからない長さ。
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** いま有効な共有リンクの token。発行していなければ(止めていれば)null。 */
export async function getShareLinkToken(teamSlug: string, kind: ShareLinkKind): Promise<string | null> {
  const rows = await query<{ token: string }>(
    "SELECT token FROM share_links WHERE team_slug = $1 AND kind = $2",
    [teamSlug, kind],
  );
  return rows[0]?.token ?? null;
}

/** 共有リンクを発行する。すでにあれば作り直す(古いリンクはその場で開けなくなる)。 */
export async function issueShareLink(teamSlug: string, kind: ShareLinkKind, createdBy: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await query(
    `INSERT INTO share_links (team_slug, kind, token, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (team_slug, kind) DO UPDATE SET
       token = EXCLUDED.token, created_by = EXCLUDED.created_by, created_at = now()`,
    [teamSlug, kind, token, createdBy],
  );
  return token;
}

/** 共有リンクを止める。 */
export async function revokeShareLink(teamSlug: string, kind: ShareLinkKind): Promise<void> {
  await query("DELETE FROM share_links WHERE team_slug = $1 AND kind = $2", [teamSlug, kind]);
}

/** URL の token が、いま有効な共有リンクと同じか。形が違うものは、データベースを見ずに断る。 */
export async function isValidShareToken(teamSlug: string, kind: ShareLinkKind, token: string): Promise<boolean> {
  if (!TOKEN_PATTERN.test(token)) {
    return false;
  }
  const expected = await getShareLinkToken(teamSlug, kind);
  return expected !== null && safeEqual(expected, token);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
