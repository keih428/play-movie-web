import { describe, expect, it } from "vitest";
import { resolveWeek, type MenuItem, type MenuWeek, type TrainingMenu } from "@/lib/domain/training";

const week = (k: string, mode: MenuWeek["mode"]): MenuWeek => ({
  k,
  s: "2026-11-09",
  e: "2026-11-15",
  name: k,
  mode,
  deload: false,
  reps: null,
  sets: null,
  pct: null,
  rir: "",
  desc: "",
  brun: "",
  satnote: "",
});

const menuWith = (tue: MenuItem[], thu: MenuItem[]): TrainingMenu =>
  ({
    s: { 担当者: "林" },
    weeks: [week("W2", "intro2")],
    t3: {},
    legs: { T1: { name: "筋力", target: "", goal: "", tueName: "脚A", thuName: "脚B", tue, thu, notes: [] } },
    upper: {
      satA: [{ n: "ベンチプレス", kind: "bp" }, { n: "懸垂" }],
      satB: [],
      self: [],
      name1: "",
      name2: "",
      desc: "",
    },
    pos: { OH: { A: "", B: "" } },
    vid: [],
  }) as unknown as TrainingMenu;

const doseOf = (menu: TrainingMenu, day: string, name: string) =>
  resolveWeek(menu, 0, { tier: "T1", slot: "AB", position: "OH", fresh: false }, {})
    .days.find((entry) => entry.day === day)
    ?.items.find((item) => item.name === name)?.dose;

describe("導入②の3RMの測定", () => {
  it("火・木は、その日に置いたメイン種目を測る(曜日で決め打ちしない)", () => {
    const menu = menuWith(
      [{ n: "トラップバーデッドリフト", kind: "dl" }],
      [{ n: "バックスクワット", kind: "sq" }],
    );
    expect(doseOf(menu, "tue", "トラップバーデッドリフト")).toBe("3RMの測定");
    expect(doseOf(menu, "thu", "バックスクワット")).toBe("3RMの測定");
  });

  it("土はベンチだけを測る", () => {
    const menu = menuWith([{ n: "バックスクワット", kind: "sq" }], [{ n: "トラップバーデッドリフト", kind: "dl" }]);
    expect(doseOf(menu, "sat", "ベンチプレス")).toBe("3RMの測定");
  });
});
