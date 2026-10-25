import { describe, expect, it } from "vitest";
import { hashMemberPassphrase, verifyMemberPassphrase } from "@/lib/server/portal-passphrase";

describe("自分の合言葉", () => {
  it("決めた合言葉は通り、違うものは通らない", async () => {
    const stored = await hashMemberPassphrase("ゆうき1234");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("ゆうき");
    await expect(verifyMemberPassphrase("ゆうき1234", stored)).resolves.toBe(true);
    await expect(verifyMemberPassphrase("ゆうき123", stored)).resolves.toBe(false);
  });

  it("全角・半角と前後の空白の違いは同じとみなす", async () => {
    const stored = await hashMemberPassphrase("abc123");
    await expect(verifyMemberPassphrase(" ａｂｃ１２３ ", stored)).resolves.toBe(true);
  });

  it("同じ合言葉でも、毎回ちがう記録になる", async () => {
    expect(await hashMemberPassphrase("same")).not.toBe(await hashMemberPassphrase("same"));
  });

  it("形のおかしい記録は通さない", async () => {
    await expect(verifyMemberPassphrase("abc", "plain-text")).resolves.toBe(false);
  });
});
