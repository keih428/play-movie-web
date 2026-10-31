import { describe, expect, it } from "vitest";
import { canEditMemberSlot, canOpenMembersBulkEdit, type MemberPosition } from "@/lib/domain/portal";

const person = (position: MemberPosition | null, flags: { isLeader?: boolean; isSystemAdmin?: boolean } = {}) => ({
  position,
  isLeader: flags.isLeader ?? false,
  isSystemAdmin: flags.isSystemAdmin ?? false,
});

describe("名簿の枠を直せる人", () => {
  it("システム担当は、だれの枠でも直せる", () => {
    expect(canEditMemberSlot(person(null, { isSystemAdmin: true }), person("MB"))).toBe(true);
  });

  it("ポジションのリーダーは、自分のまとまりの部員の枠だけ直せる(OH のリーダーは OP も)", () => {
    const ohLeader = person("OH", { isLeader: true });
    expect(canEditMemberSlot(ohLeader, person("OH"))).toBe(true);
    expect(canEditMemberSlot(ohLeader, person("OP"))).toBe(true);
    expect(canEditMemberSlot(ohLeader, person("MB"))).toBe(false);
    expect(canEditMemberSlot(ohLeader, person(null))).toBe(false);
  });

  it("リーダーでない部員は直せない", () => {
    expect(canEditMemberSlot(person("OH"), person("OH"))).toBe(false);
  });

  it("まとめて編集を開けるのは、システム担当と、ポジションのあるリーダー", () => {
    expect(canOpenMembersBulkEdit(person(null, { isSystemAdmin: true }))).toBe(true);
    expect(canOpenMembersBulkEdit(person("S", { isLeader: true }))).toBe(true);
    expect(canOpenMembersBulkEdit(person(null, { isLeader: true }))).toBe(false);
    expect(canOpenMembersBulkEdit(person("S"))).toBe(false);
  });
});
