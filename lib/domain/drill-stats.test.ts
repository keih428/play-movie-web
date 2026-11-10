import { describe, expect, it } from "vitest";
import {
  canRecordDrillStats,
  drillKindOfTab,
  emptyGradeCounts,
  getErrorRate,
  getGoodRate,
  normalizeDrillName,
  parseStatsTab,
  tableDrillCounts,
  totalOf,
} from "@/lib/domain/drill-stats";

describe("マネージャーの集計", () => {
  it("集計を付けられるのは、スタッフ(ポジションのない人)全員と、システム担当", () => {
    const player = { position: "OH" as const, isSystemAdmin: false };
    expect(canRecordDrillStats({ position: null, isSystemAdmin: false })).toBe(true);
    expect(canRecordDrillStats({ ...player, isSystemAdmin: true })).toBe(true);
    expect(canRecordDrillStats(player)).toBe(false);
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

describe("集計のタブ", () => {
  it("?tab= からタブを決め、前の ?skill=dig のリンクはディグへ", () => {
    expect(parseStatsTab("spike")).toBe("spike");
    expect(parseStatsTab(undefined, "dig")).toBe("dig");
    expect(parseStatsTab("other")).toBe("spike");
    expect(parseStatsTab("reception")).toBe("reception");
    expect(drillKindOfTab("reception")).toBe("reception");
    expect(drillKindOfTab("dig")).toBe("serve_dig");
    expect(drillKindOfTab("spike")).toBe("spike");
    expect(drillKindOfTab("serving")).toBe("serving");
    expect(drillKindOfTab("serve")).toBe("serve_dig");
  });
});
