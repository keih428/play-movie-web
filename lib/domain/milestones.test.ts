import { describe, expect, it } from "vitest";
import {
  MILESTONE_MAX,
  formatMilestoneMonth,
  getEditableMilestoneMonths,
  getUpcomingMilestoneMonth,
  milestoneKey,
  monthOf,
  nextMonthOf,
  normalizeMilestone,
} from "@/lib/domain/milestones";

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

  it("次の月(年をまたぐときも)", () => {
    expect(nextMonthOf("2026-10")).toBe("2026-11");
    expect(nextMonthOf("2026-12")).toBe("2027-01");
  });

  it("月末の最後の7日間だけ、来月を先に決められる", () => {
    // 10月は31日まで:25日〜31日が最終週
    expect(getUpcomingMilestoneMonth("2026-10-24")).toBeNull();
    expect(getUpcomingMilestoneMonth("2026-10-25")).toBe("2026-11");
    expect(getUpcomingMilestoneMonth("2026-10-31")).toBe("2026-11");
    // 2月(28日まで):22日から。12月は来年の1月
    expect(getUpcomingMilestoneMonth("2027-02-21")).toBeNull();
    expect(getUpcomingMilestoneMonth("2027-02-22")).toBe("2027-03");
    expect(getUpcomingMilestoneMonth("2026-12-31")).toBe("2027-01");
    // 月の初めは今月だけ
    expect(getEditableMilestoneMonths("2026-11-01")).toEqual(["2026-11"]);
    expect(getEditableMilestoneMonths("2026-11-30")).toEqual(["2026-11", "2026-12"]);
  });
});
