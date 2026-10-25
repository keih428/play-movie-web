import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Member, MemberRole } from "@/lib/domain/portal";
import { buildTeamLoginPath } from "@/lib/domain/team";
import { touchMemberDevice } from "@/lib/server/portal-login-log";
import { getMember } from "@/lib/server/portal-member-store";

export const SESSION_COOKIE = "portal_session";
export const DEVICE_COOKIE = "portal_device";
// ブラウザが許す上限。開くたびに middleware が延ばし直す。
export const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export type PortalSession = {
  memberId: string;
  teamSlug: string;
  name: string;
  role: MemberRole;
  generation: string;
  // 自分の合言葉の番号(2026-10-25 から)。決め直す・消すと名簿の番号が増え、前のクッキーは使えなくなる。
  // それより前のクッキーには無いので、0 とみなす。
  passphraseVersion?: number;
};

export type RequestInfo = {
  ip: string | null;
  userAgent: string | null;
};

function getSecrets() {
  const passphrase = process.env.PORTAL_PASSPHRASE;
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (passphrase && secret) {
    return { passphrase, secret };
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "部内ページの設定が足りません。環境変数 `PORTAL_PASSPHRASE` と `PORTAL_SESSION_SECRET` を設定してください。",
    );
  }

  return {
    passphrase: passphrase ?? "utvb-dev",
    secret: secret ?? "local-development-only",
  };
}

function normalizePassphrase(value: string) {
  return value.normalize("NFKC").trim();
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

// 合言葉を変えるとこの値が変わり、前の合言葉で作ったクッキーはすべて無効になる。
function getGeneration() {
  const { passphrase, secret } = getSecrets();
  return sign(`generation:${normalizePassphrase(passphrase)}`, secret).slice(0, 16);
}

export function isCorrectPassphrase(input: string): boolean {
  const { passphrase } = getSecrets();
  return timingSafeEqual(
    digest(normalizePassphrase(input)),
    digest(normalizePassphrase(passphrase)),
  );
}

export function createSessionValue(member: Member): string {
  const session: PortalSession = {
    memberId: member.id,
    teamSlug: member.teamSlug,
    name: member.displayName,
    role: member.role,
    generation: getGeneration(),
    passphraseVersion: member.passphraseVersion,
  };
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body, getSecrets().secret)}`;
}

function parseSessionValue(value: string | undefined): PortalSession | null {
  if (!value) {
    return null;
  }

  const [body, signature] = value.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(body, getSecrets().secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PortalSession;
    return session.generation === getGeneration() ? session : null;
  } catch {
    return null;
  }
}

export function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * クッキーだけを見る(データベースには触らない)。ヘッダーの表示など、
 * 試合ビューアの画面でも呼ばれる場所で使う。設定が足りないときは未ログイン扱い。
 */
export async function getSession(): Promise<PortalSession | null> {
  try {
    return parseSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function getRequestInfo(): Promise<RequestInfo> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwardedFor || headerList.get("x-real-ip"),
    userAgent: headerList.get("user-agent"),
  };
}

/** API 用。名簿から外れた人・ほかのチームのクッキーは未ログイン扱い。 */
export async function getCurrentMember(teamSlug: string): Promise<Member | null> {
  const session = parseSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || session.teamSlug !== teamSlug) {
    return null;
  }

  const member = await getMember(session.memberId);
  if (!member || !member.active || member.teamSlug !== teamSlug) {
    return null;
  }
  // 自分の合言葉を決め直した・消した後は、それより前のログインを無効にする(ほかの端末も含めて)。
  if ((session.passphraseVersion ?? 0) !== member.passphraseVersion) {
    return null;
  }

  const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (deviceId) {
    await touchMemberDevice(member.id, deviceId, await getRequestInfo());
  }
  return member;
}

/** ページ用。ログインしていなければログイン画面へ送る。 */
export async function requireMember(teamSlug: string, returnTo: string): Promise<Member> {
  const member = await getCurrentMember(teamSlug);
  if (!member) {
    redirect(`${buildTeamLoginPath(teamSlug)}?next=${encodeURIComponent(returnTo)}`);
  }
  return member;
}
