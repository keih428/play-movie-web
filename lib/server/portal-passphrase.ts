import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
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
