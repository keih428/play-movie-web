import { describe, expect, it } from "vitest";
import { getTallyStart, tallyAttendance } from "@/lib/domain/attendance";

describe("遅刻・早退・欠席の集計", () => {
  it("部員ごとに数え、「遅刻・早退」は遅刻と早退の両方に数える", () => {
    const tallies = tallyAttendance([
      { memberId: "a", kind: "absent" },
      { memberId: "a", kind: "late" },
      { memberId: "a", kind: "late_early" },
      { memberId: "b", kind: "early" },
    ]);
    expect(tallies.get("a")).toEqual({ absent: 1, late: 2, early: 1 });
    expect(tallies.get("b")).toEqual({ absent: 0, late: 0, early: 1 });
    expect(tallies.get("c")).toBeUndefined();
  });

  it("今月は1日から、全部は集計を始めた 11/1 から数える(11/1 より前は数えない)", () => {
    expect(getTallyStart("2026-12-15", "month")).toBe("2026-12-01");
    expect(getTallyStart("2026-12-15", "all")).toBe("2026-11-01");
    expect(getTallyStart("2026-10-31", "month")).toBe("2026-11-01");
  });
});
