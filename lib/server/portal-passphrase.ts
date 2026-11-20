import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// 自分の合言葉(2026-10-25 から)は、そのまま残さず scrypt のハッシュにして残す。
// 形は "scrypt$<salt>$<hash>"(どちらも base64url)。
const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 32;

export function normalizeMemberPassphrase(value: string): string {
  return value.normalize("NFKC").trim();
}

export async function hashMemberPassphrase(value: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(normalizeMemberPassphrase(value), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyMemberPassphrase(value: string, stored: string): Promise<boolean> {
  const [kind, saltText, hashText] = stored.split("$");
  if (kind !== "scrypt" || !saltText || !hashText) {
    return false;
  }
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(normalizeMemberPassphrase(value), Buffer.from(saltText, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// 忘れた人のために、システム担当が見られる控え(2026-11-20 から)。
// ログインの確かめはハッシュのまま。控えは PORTAL_SESSION_SECRET から作った鍵で AES-256-GCM で包んで残す。
// 形は "aesgcm$<iv>$<tag>$<本文>"(どれも base64url)。秘密を変えると控えは開けなくなる(合言葉そのものは通る)。
function getSealKey(): Buffer {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret && process.env.VERCEL === "1") {
    throw new Error("環境変数 `PORTAL_SESSION_SECRET` を設定してください。");
  }
  return createHash("sha256")
    .update(`member-passphrase:${secret ?? "local-development-only"}`)
    .digest();
}

export function sealMemberPassphrase(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSealKey(), iv);
  const body = Buffer.concat([cipher.update(normalizeMemberPassphrase(value), "utf8"), cipher.final()]);
  return ["aesgcm", iv, cipher.getAuthTag(), body].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join("$");
}

/** 控えを開く。形がおかしい・鍵が違うときは null。 */
export function openMemberPassphrase(sealed: string): string | null {
  const [kind, ivText, tagText, bodyText] = sealed.split("$");
  if (kind !== "aesgcm" || !ivText || !tagText || bodyText === undefined) {
    return null;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", getSealKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
