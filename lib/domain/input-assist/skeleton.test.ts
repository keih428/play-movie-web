import { describe, expect, it } from "vitest";
import {
  canUseInputAssist,
  createEmptySet,
  getRallyWindow,
  isLowConfidence,
  normalizeSets,
} from "@/lib/domain/input-assist/session";
import { applySkeleton, parseSkeleton, SkeletonError } from "@/lib/domain/input-assist/skeleton";

describe("打ち込み補助:骨組みの読み込み", () => {
  const text = JSON.stringify({
    version: 1,
    youtube: { "2": "https://youtu.be/abc" },
    rallies: [
      { set: 2, serveTime: 30.04, side: "far", pSide: 0.6 },
      { set: 2, serveTime: 10, side: "near", pSide: 0.97 },
      { set: 3, serveTime: 5, side: "near", pSide: 0.9 },
    ],
  });

  it("骨組みのセットはラリーを入れ替え、ないセットは作る(スタメンは前のセットから)", () => {
    const set1 = { ...createEmptySet(1), youtubeUrl: "https://youtu.be/one" };
    set1.startingLineup.home.positions["1"] = 7;
    const set2 = {
      ...createEmptySet(2),
      rallies: [{ id: "old", serveTime: 1, side: null, status: "rally" as const, source: "manual" as const }],
    };
    const result = applySkeleton([set1, set2], parseSkeleton(text));
    expect(result.sets.map((set) => set.setIndex)).toEqual([1, 2, 3]);
    expect(result.replacedSets).toEqual([2, 3]);
    expect(result.sets[1].youtubeUrl).toBe("https://youtu.be/abc");
    expect(result.sets[1].rallies.map((rally) => rally.serveTime)).toEqual([10, 30]);
    expect(result.sets[1].rallies[1].confidence).toBe(0.6);
    expect(result.sets[2].youtubeUrl).toBe("https://youtu.be/abc");
    expect(result.sets[0].rallies).toEqual([]);
  });

  it("形が違うものは、理由を付けて断る", () => {
    expect(() => parseSkeleton("{")).toThrow(SkeletonError);
    expect(() => parseSkeleton(JSON.stringify({ version: 2, rallies: [] }))).toThrow("version");
    expect(() => parseSkeleton(JSON.stringify({ version: 1, rallies: [{ set: 9, serveTime: 1 }] }))).toThrow(
      "1番目",
    );
  });
});

describe("打ち込み補助:画面の決まり", () => {
  it("使えるのはスタッフ・ポジションのない人・システム担当", () => {
    expect(canUseInputAssist({ position: null, role: "member", isSystemAdmin: false })).toBe(true);
    expect(canUseInputAssist({ position: "OH", role: "staff", isSystemAdmin: false })).toBe(true);
    expect(canUseInputAssist({ position: "OH", role: "member", isSystemAdmin: true })).toBe(true);
    expect(canUseInputAssist({ position: "OH", role: "member", isSystemAdmin: false })).toBe(false);
  });

  it("ラリーの区間はサーブの 2 秒前から次のサーブの 3 秒前まで", () => {
    const rallies = [
      { id: "b", serveTime: 50, side: null, status: "rally" as const, source: "auto" as const },
      { id: "a", serveTime: 10, side: null, status: "rally" as const, source: "auto" as const },
    ];
    expect(getRallyWindow(rallies, "a")).toEqual({ start: 8, end: 47 });
    expect(getRallyWindow(rallies, "b")).toEqual({ start: 48, end: 70 });
  });

  it("確かさが 0.8 より低く、まだ確かめていないラリーを目立たせる", () => {
    const base = { id: "a", serveTime: 1, side: "near" as const, status: "rally" as const, source: "auto" as const };
    expect(isLowConfidence({ ...base, confidence: 0.5 })).toBe(true);
    expect(isLowConfidence({ ...base, confidence: 0.5, checked: true })).toBe(false);
    expect(isLowConfidence({ ...base, confidence: 0.9 })).toBe(false);
    expect(isLowConfidence(base)).toBe(false);
  });

  it("受け取ったセットの形を整える(同じセットは1つに、時刻は 0.1 秒に)", () => {
    const sets = normalizeSets([
      { setIndex: 2, rallies: [{ id: "x", serveTime: 1.234, side: "far" }], finalScore: { home: "25", away: "" } },
      { setIndex: 2 },
      { setIndex: 1, startingLineup: { home: { positions: { "1": "7" }, setterAt: 9 } } },
    ]);
    expect(sets.map((set) => set.setIndex)).toEqual([1, 2]);
    expect(sets[0].startingLineup.home).toEqual({
      positions: { "1": 7, "2": null, "3": null, "4": null, "5": null, "6": null },
      setterAt: 1,
    });
    expect(sets[1].rallies[0]).toMatchObject({ serveTime: 1.2, side: "far", status: "rally", source: "manual" });
    expect(sets[1].finalScore).toEqual({ home: 25, away: null });
  });
});
