// VSM の _id と同じ形(24 桁の16進数。先頭 8 桁は作った時刻)。

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

export function createObjectId(now: number = Date.now()): string {
  return Math.floor(now / 1000).toString(16).padStart(8, "0").slice(-8) + randomHex(16);
}

export type IdFactory = () => string;
