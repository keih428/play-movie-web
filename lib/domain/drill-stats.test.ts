import { describe, expect, it } from "vitest";
import {
  canRecordDrillStats,
  emptyGradeCounts,
  getErrorRate,
  getGoodRate,
  normalizeDrillName,
  tableDrillCounts,
  totalOf,
} from "@/lib/domain/drill-stats";

describe("マネージャーの集計", () => {
  it("集計を付けられるのは、マネージャー・アナリストと、システム担当(トレーニング担当は付けられない)", () => {
    const base = { title: null, isSystemAdmin: false };
    expect(canRecordDrillStats({ ...base, title: "マネージャー" })).toBe(true);
    expect(canRecordDrillStats({ ...base, title: "主務・マネージャー" })).toBe(true);
    expect(canRecordDrillStats({ ...base, title: "アナリスト" })).toBe(true);
    expect(canRecordDrillStats({ ...base, isSystemAdmin: true })).toBe(true);
    expect(canRecordDrillStats({ ...base, title: "コーチ" })).toBe(false);
    expect(canRecordDrillStats(base)).toBe(false);
  });

  it("本数を部員・スキル・評価の表にまとめ、割合を出す", () => {
    const table = tableDrillCounts([
      { memberId: "a", skill: "serve", grade: "#", count: 2 },
      { memberId: "a", skill: "serve", grade: "+", count: 3 },
      { memberId: "a", skill: "serve", grade: "=", count: 5 },
      { memberId: "a", skill: "dig", grade: "!", count: 1 },
    ]);
    const serve = table.get("a")!.serve;
    expect(totalOf(serve)).toBe(10);
    expect(getGoodRate(serve)).toBe(50);
    expect(getErrorRate(serve)).toBe(50);
    expect(totalOf(table.get("a")!.dig)).toBe(1);
    expect(getGoodRate(emptyGradeCounts())).toBeNull();
  });

  it("メニューの名前は空白を整え、空や長すぎるものは受け付けない", () => {
    expect(normalizeDrillName("  サーブ練  1  ")).toBe("サーブ練 1");
    expect(normalizeDrillName("   ")).toBeNull();
    expect(normalizeDrillName("あ".repeat(41))).toBeNull();
  });
});
