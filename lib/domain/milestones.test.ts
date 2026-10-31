import { describe, expect, it } from "vitest";
import { MILESTONE_MAX, formatMilestoneMonth, milestoneKey, monthOf, normalizeMilestone } from "@/lib/domain/milestones";

describe("月間マイルストーン", () => {
  it("日付から月を取り出す", () => {
    expect(monthOf("2026-11-03")).toBe("2026-11");
  });

  it("月の表示は、同じ年なら「11月」、年が違えば年も付ける", () => {
    expect(formatMilestoneMonth("2026-11")).toBe("11月");
    expect(formatMilestoneMonth("2026-11", "2026-12")).toBe("11月");
    expect(formatMilestoneMonth("2026-12", "2027-01")).toBe("2026年12月");
  });

  it("書いた文は前後の空白を落とし、空・長すぎ・文字でないものは断る", () => {
    expect(normalizeMilestone("  サーブで崩す  ")).toBe("サーブで崩す");
    expect(normalizeMilestone("   ")).toBeNull();
    expect(normalizeMilestone("あ".repeat(MILESTONE_MAX + 1))).toBeNull();
    expect(normalizeMilestone(3)).toBeNull();
  });

  it("部員と月でキーを作る", () => {
    expect(milestoneKey("m-1", "2026-11")).toBe("m-1|2026-11");
  });
});
