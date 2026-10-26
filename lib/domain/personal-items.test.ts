import { describe, expect, it } from "vitest";
import {
  applyPersonalItems,
  applyPersonalLogItems,
  normalizePersonalDays,
  type PersonalItem,
} from "@/lib/domain/personal-items";
import type { LogMenuOption, ResolvedDay, ResolvedItem } from "@/lib/domain/training";

const item = (name: string, dose = ""): ResolvedItem => ({
  name,
  dose,
  tip: "",
  main: false,
  swapped: false,
  weighted: false,
  kind: "",
  targetKg: null,
  videoUrl: null,
  english: null,
});

const day = (names: string[], weekday: ResolvedDay["day"] = "sat"): ResolvedDay => ({
  day: weekday,
  title: "上半身",
  time: "",
  date: null,
  items: names.map((name) => item(name)),
  extras: [],
});

const personal = (name: string, days: PersonalItem["days"], dose = "10回 × 3"): PersonalItem => ({
  id: name,
  name,
  dose,
  tip: "",
  days,
  weighted: false,
});

describe("個人の追加メニュー", () => {
  it("「個人の追加」の行を、その人の種目に入れ替える", () => {
    const result = applyPersonalItems(day(["ベンチプレス", "個人の追加(面談で林と決めたもの)", "ストレッチ"]), [
      personal("メディシンボール 横投げ", ["sat"]),
      personal("ノルディック", ["sat", "self"]),
    ]);
    expect(result.items.map((entry) => entry.name)).toEqual([
      "ベンチプレス",
      "メディシンボール 横投げ",
      "ノルディック",
      "ストレッチ",
    ]);
    expect(result.items[1].personal).toBe(true);
    expect(result.items[1].dose).toBe("10回 × 3");
  });

  it("「個人の追加」の行がない日は、最後に足す", () => {
    const result = applyPersonalItems(day(["スクワット"], "tue"), [personal("カーフレイズ", ["tue"])]);
    expect(result.items.map((entry) => entry.name)).toEqual(["スクワット", "カーフレイズ"]);
  });

  it("その曜日の種目がなければ、そのまま", () => {
    const original = day(["ベンチプレス", "個人の追加(面談で林と決めたもの)"]);
    expect(applyPersonalItems(original, [personal("カーフレイズ", ["tue"])])).toBe(original);
  });

  it("メニューに同じ名前の種目があれば、二重にしない", () => {
    const result = applyPersonalItems(day(["ノルディック", "個人の追加(面談)"]), [personal("ノルディック", ["sat"], "5回 × 2")]);
    expect(result.items.map((entry) => [entry.name, entry.dose])).toEqual([["ノルディック", "5回 × 2"]]);
  });

  it("休みの日(種目がない日)には足さない", () => {
    const empty = day([], "thu");
    expect(applyPersonalItems(empty, [personal("カーフレイズ", ["thu"])])).toBe(empty);
  });

  it("トレ録のメニューにも同じように入る", () => {
    const option: LogMenuOption = {
      key: "p/W1/self",
      weekKey: "p/W1",
      weekLabel: "W1",
      day: "self",
      dayLabel: "自主",
      items: [
        { name: "ベンチプレス", dose: "5回 × 3", kind: "bp", weighted: true, targetKg: 60 },
        { name: "個人の追加(面談で林と決めたもの)", dose: "10〜15分", kind: "", weighted: false, targetKg: null },
      ],
    };
    const result = applyPersonalLogItems(option, [{ ...personal("ダンベルロー", ["self"]), weighted: true }]);
    expect(result.items).toEqual([
      { name: "ベンチプレス", dose: "5回 × 3", kind: "bp", weighted: true, targetKg: 60 },
      { name: "ダンベルロー", dose: "10回 × 3", kind: "", weighted: true, targetKg: null },
    ]);
  });

  it("曜日は決まった順に揃え、知らない値は捨てる", () => {
    expect(normalizePersonalDays(["self", "tue", "sun", 3])).toEqual(["tue", "self"]);
    expect(normalizePersonalDays("tue")).toEqual([]);
  });
});
