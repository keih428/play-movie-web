import { describe, expect, it } from "vitest";
import {
  formatBulkAttendanceMessage,
  getTallyStart,
  parseAttendanceInput,
  pickDatesByWeekday,
  tallyAttendance,
  weekdayOf,
} from "@/lib/domain/attendance";

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

describe("遅刻・欠席をまとめて出す", () => {
  it("練習のある日から、選んだ曜日の日だけを古い順に", () => {
    // 2026-11-10 は火曜、11-12 は木曜、11-17 は火曜。
    expect(pickDatesByWeekday(["2026-11-17", "2026-11-12", "2026-11-10"], [2])).toEqual(["2026-11-10", "2026-11-17"]);
    expect(weekdayOf("2026-11-08")).toBe(0);
  });

  it("入力を確かめる(遅刻には来る時刻、理由は必ず)", () => {
    expect(parseAttendanceInput({ kind: "late", arriveAt: "18:30", reason: " 授業 " })).toEqual({
      input: { kind: "late", arriveAt: "18:30", leaveAt: null, reason: "授業", note: "" },
    });
    expect(parseAttendanceInput({ kind: "late", reason: "授業" })).toHaveProperty("error");
    expect(parseAttendanceInput({ kind: "absent", reason: "" })).toHaveProperty("error");
  });

  it("備考は書かなくてよい", () => {
    expect(parseAttendanceInput({ kind: "absent", reason: "授業", note: " 試験前 " })).toEqual({
      input: { kind: "absent", arriveAt: null, leaveAt: null, reason: "授業", note: "試験前" },
    });
  });

  it("Slack には1通にまとめる", () => {
    const text = formatBulkAttendanceMessage(
      { memberName: "15林", position: "OH" },
      ["2026-11-10", "2026-11-17"],
      { kind: "late", arriveAt: "18:30", leaveAt: null, reason: "授業", note: "" },
      1,
    );
    expect(text).toContain("【遅刻・まとめて2日】15林(OH) 18:30 から");
    expect(text).toContain("理由:授業");
    expect(text).toContain("1日は、前に出した連絡を訂正");
  });
});
