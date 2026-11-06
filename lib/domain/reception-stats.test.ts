import { describe, expect, it } from "vitest";
import { formatPassRate, parseReceptionSetup, rankReception } from "@/lib/domain/reception-stats";

describe("レセプションの集計", () => {
  it("ABパス率の高い順。規定の数に届かない人は対象外で下に、同じ率は同じ順位", () => {
    const rows = rankReception([
      { memberId: "a", passes: 12, attempts: 20 },
      { memberId: "a", passes: 3, attempts: 5 },
      { memberId: "b", passes: 18, attempts: 30 },
      { memberId: "c", passes: 9, attempts: 10 },
      { memberId: "d", passes: 10, attempts: 25 },
    ]);
    expect(rows.map((row) => [row.memberId, row.rank])).toEqual([
      ["b", 1],
      ["a", 1],
      ["d", 3],
      ["c", null],
    ]);
    expect(formatPassRate(rows[0].passes, rows[0].attempts)).toBe("60.0%");
    expect(formatPassRate(0, 0)).toBe("—");
  });

  it("受ける人の選び方は、形の合わないところを捨てて読む", () => {
    expect(parseReceptionSetup({ members: ["a", "a", 3, "b"] })).toEqual({ members: ["a", "b"] });
    expect(parseReceptionSetup({})).toBeNull();
    expect(parseReceptionSetup(null)).toBeNull();
  });
});
