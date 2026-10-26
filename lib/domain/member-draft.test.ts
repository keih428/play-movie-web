import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, diffDraft } from "@/lib/domain/member-draft";

describe("名簿のまとめて編集", () => {
  const before = { ...EMPTY_DRAFT, name: "林", number: "15", grade: "3", position: "OP" };

  it("変えた項目だけを返す", () => {
    expect(diffDraft(before, { ...before, number: "1", isExecutive: true })).toEqual({ number: "1", isExecutive: true });
  });

  it("何も変えていなければ null(前後の空白だけの違いも同じとみなす)", () => {
    expect(diffDraft(before, { ...before })).toBeNull();
    expect(diffDraft(before, { ...before, name: " 林 " })).toBeNull();
  });

  it("空にしたのも変更として返す", () => {
    expect(diffDraft(before, { ...before, grade: "" })).toEqual({ grade: "" });
  });
});
