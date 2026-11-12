import { describe, expect, it } from "vitest";
import {
  buildDefaultExercises,
  buildLiftHistory,
  compactExercises,
  findVideoLink,
  splitT0,
  exerciseUnit,
  inferUnit,
  parseDose,
  findLogMenuKey,
  isEditableLogDate,
  resolveWeek,
  summarizeSets,
  toLogMenuItem,
  weightModeOf,
  type MenuItem,
  type MenuWeek,
  type TrainingMenu,
} from "@/lib/domain/training";

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
    expect(doseOf(menu, "tue", "トラップバーデッドリフト")).toBe("3RMの測定 3回 × 3");
    expect(doseOf(menu, "thu", "バックスクワット")).toBe("3RMの測定 3回 × 3");
  });

  it("日(上半身の日)はベンチだけを測る", () => {
    const menu = menuWith([{ n: "バックスクワット", kind: "sq" }], [{ n: "トラップバーデッドリフト", kind: "dl" }]);
    expect(doseOf(menu, "sat", "ベンチプレス")).toBe("3RMの測定 3回 × 3");
  });
});

describe("上半身は日曜(2026-11-05 から)", () => {
  const menu = menuWith([], []);
  menu.s["日の枠A"] = "9:00〜10:30";
  menu.s["日の枠B"] = "11:10〜13:00";
  const dayOf = (slot: "AB" | "C", fresh = false) =>
    resolveWeek(menu, 0, { tier: "T1", slot, position: "OH", fresh }, {}).days.find((entry) => entry.day === "sat");

  it("日付は週の始まり(月)の6日後、時間は日の枠", () => {
    expect(dayOf("AB")?.date).toBe("2026-11-15");
    expect(dayOf("AB")?.time).toBe("9:00〜10:30");
    expect(dayOf("C")?.time).toBe("11:10〜13:00");
  });

  it("日の枠がない古いメニューは、土の枠の時間を出す", () => {
    const old = menuWith([], []);
    old.s["土の枠A"] = "8:30〜10:00(練習の前)";
    const day = resolveWeek(old, 0, { tier: "T1", slot: "AB", position: "OH", fresh: false }, {}).days.find(
      (entry) => entry.day === "sat",
    );
    expect(day?.time).toBe("8:30〜10:00(練習の前)");
  });

  it("記録で初めに選ぶメニューは、日曜なら上半身、土曜なら自主", () => {
    const programs = [{ key: "2026-11-09", menu }];
    const options = ["tue", "thu", "sat", "self"].map((day) => ({
      key: `2026-11-09/W2/${day}`,
      weekKey: "2026-11-09/W2",
      weekLabel: "",
      day: day as "tue" | "thu" | "sat" | "self",
      dayLabel: "",
      items: [],
    }));
    expect(findLogMenuKey(programs, options, "2026-11-15")).toBe("2026-11-09/W2/sat");
    expect(findLogMenuKey(programs, options, "2026-11-14")).toBe("2026-11-09/W2/self");
  });

  it("記録の画面には、注意点・C枠の置き換えの印も渡す(空なら持たない)", () => {
    const base = {
      name: "ベンチプレス",
      dose: "5回 × 3",
      tip: "",
      main: true,
      swapped: false,
      weighted: true,
      kind: "bp" as const,
      targetKg: 60,
      videoUrl: "https://example.com/v",
      english: null,
    };
    expect(toLogMenuItem(base)).toEqual({ name: "ベンチプレス", dose: "5回 × 3", kind: "bp", weighted: true, targetKg: 60 });
    expect(toLogMenuItem({ ...base, tip: "胸を張る", swapped: true })).toEqual({
      name: "ベンチプレス",
      dose: "5回 × 3",
      kind: "bp",
      weighted: true,
      targetKg: 60,
      tip: "胸を張る",
      swapped: true,
    });
  });
});

describe("重さの欄の出し方(2026-11-05 から)", () => {
  it("懸垂・ディップスは自重+、加重しないやり方は自重", () => {
    expect(weightModeOf("懸垂")).toBe("bwplus");
    expect(weightModeOf("ディップス")).toBe("bwplus");
    expect(weightModeOf("加重懸垂")).toBe("bwplus");
    expect(weightModeOf("ネガティブ懸垂 5回 × 3")).toBe("bw");
    expect(weightModeOf("ベンチディップス 10回 × 3")).toBe("bw");
  });

  it("体だけで行う種目は自重、道具や重りを使うものは kg", () => {
    expect(weightModeOf("プランク")).toBe("bw");
    expect(weightModeOf("ノルディックハムストリングカール")).toBe("bw");
    expect(weightModeOf("ボックスジャンプ")).toBe("bw");
    expect(weightModeOf("プランク(重り付き)")).toBe("kg");
    expect(weightModeOf("トラップバージャンプ")).toBe("kg");
    expect(weightModeOf("スプリットスクワット(自重〜軽いダンベル)")).toBe("kg");
    expect(weightModeOf("ベンチプレス")).toBe("kg");
    expect(weightModeOf("メディシンボールの叩きつけ(スラムボール)")).toBe("kg");
  });

  it("まとめの文字", () => {
    expect(summarizeSets([{ kg: null, reps: 10 }, { kg: null, reps: 10 }], "bw")).toBe("自重 × 10回 × 2set");
    expect(summarizeSets([{ kg: 70, reps: 10 }], "bw")).toBe("自重 × 10回");
    expect(summarizeSets([{ kg: 10, reps: 8 }, { kg: null, reps: 6 }], "bwplus")).toBe("自重+10kg × 8回、自重 × 6回");
    expect(summarizeSets([{ kg: 60, reps: 5 }])).toBe("60kg × 5回");
  });

  it("自重の種目は、保存のときも前回の記録から始めるときも重さを持たない", () => {
    expect(compactExercises([{ name: "プランク", lift: null, sets: [{ kg: 70, reps: 1 }] }])).toEqual([
      { name: "プランク", lift: null, sets: [{ kg: null, reps: 1 }] },
    ]);
    expect(compactExercises([{ name: "懸垂", lift: null, sets: [{ kg: 5, reps: 8 }] }])[0].sets).toEqual([
      { kg: 5, reps: 8 },
    ]);
    const start = buildDefaultExercises(
      { items: [{ name: "プランク", dose: "30秒 × 3", kind: "", weighted: false, targetKg: null }] },
      { プランク: [{ kg: 70, reps: 1 }] },
    );
    expect(start[0].sets).toEqual([{ kg: null, reps: 1 }]);
  });
});

describe("秒数の種目(2026-11-05 から)", () => {
  it("メニューの「◯秒 × ◯」で秒、なければ名前で決める", () => {
    expect(inferUnit("プランク", "45秒 × 3")).toBe("sec");
    expect(inferUnit("ポゴ(足首だけで弾む)", "20秒 × 4")).toBe("sec");
    expect(inferUnit("ポゴ(足首だけでその場で低く跳ねる)", "10回 × 3")).toBe("reps");
    expect(inferUnit("サイドプランク")).toBe("sec");
    expect(inferUnit("ベンチプレス")).toBe("reps");
    expect(exerciseUnit({ name: "プランク" })).toBe("sec");
    expect(exerciseUnit({ name: "プランク", unit: "reps" })).toBe("reps");
  });

  it("秒数とセット数を読む", () => {
    expect(parseDose("45秒 × 3")).toEqual({ reps: 45, sets: 3 });
    expect(parseDose("各30〜40秒 × 2")).toEqual({ reps: 30, sets: 2 });
  });

  it("記録の欄は秒数で始まり、まとめは「秒」", () => {
    const start = buildDefaultExercises(
      { items: [{ name: "プランク", dose: "45秒 × 3", kind: "", weighted: false, targetKg: null }] },
      {},
    );
    expect(start[0]).toEqual({
      name: "プランク",
      lift: null,
      unit: "sec",
      sets: [
        { kg: null, reps: 45 },
        { kg: null, reps: 45 },
        { kg: null, reps: 45 },
      ],
    });
    expect(summarizeSets(start[0].sets, "bw", "sec")).toBe("自重 × 45秒 × 3set");
    expect(compactExercises(start)[0].unit).toBe("sec");
  });
});

describe("チェックの種目・T0 の置き換え・動画(2026-11-05 から)", () => {
  it("「10分」の種目とストレッチ・ウォームアップは、やったかどうかのチェック", () => {
    expect(inferUnit("動的ストレッチ・モビリティ(股関節・足首)", "10分")).toBe("check");
    expect(inferUnit("肩のウォームアップ(チューブで外旋・肩甲骨まわり)", "5分")).toBe("check");
    expect(inferUnit("動的ストレッチ")).toBe("check");
    const start = buildDefaultExercises(
      { items: [{ name: "動的ストレッチ", dose: "10分", kind: "", weighted: false, targetKg: null }] },
      { 動的ストレッチ: [{ kg: null, reps: 1 }] },
    );
    // 前にやっていても、チェックなしから始める
    expect(start[0]).toEqual({ name: "動的ストレッチ", lift: null, unit: "check", sets: [{ kg: null, reps: null }] });
    expect(compactExercises(start)).toEqual([]);
    expect(summarizeSets([{ kg: null, reps: 1 }], "kg", "check")).toBe("やった");
  });

  it("導入の週のメイン種目も、セットの数だけ欄ができる", () => {
    // W2:火にベンチを置くと測定しない日 → 軽い重さで 8回 × 3。木のスクワットは測定 → 3回 × 3
    const menu = menuWith([{ n: "ベンチプレス", kind: "bp" }], [{ n: "バックスクワット", kind: "sq" }]);
    expect(doseOf(menu, "thu", "バックスクワット")).toBe("3RMの測定 3回 × 3");
    expect(doseOf(menu, "tue", "ベンチプレス")).toBe("軽い重さで 8回 × 3");
    expect(parseDose("3RMの測定 3回 × 3")).toEqual({ reps: 3, sets: 3 });
  });

  it("「T0の場合」を名前・回数・ポイントに分ける", () => {
    expect(splitT0("ダンベルベンチプレス 10回 × 3(あと3回できる重さ)")).toEqual({
      name: "ダンベルベンチプレス",
      dose: "10回 × 3",
      tip: "あと3回できる重さ",
    });
    expect(splitT0("ネガティブ懸垂 5回 × 3")).toEqual({ name: "ネガティブ懸垂", dose: "5回 × 3", tip: "" });
    expect(splitT0("3kg で 各5回 × 3")).toEqual({ name: null, dose: "3kg で 各5回 × 3", tip: "" });
  });

  it("動画は、いちばん長く合う名前のもの", () => {
    const links: [string, string][] = [["プランク", "u1"], ["サイドプランク", "u2"]];
    expect(findVideoLink(links, "サイドプランク")).toBe("u2");
    expect(findVideoLink(links, "プランク(重り付き)")).toBe("u1");
    expect(findVideoLink(links, "ベンチプレス")).toBeNull();
  });
});

describe("トレ録を記録・直せる日付(2026-11-08 から)", () => {
  it("1年前(366日前)から明日まで。形の違うものは外す", () => {
    const today = "2026-11-08";
    expect(isEditableLogDate("2025-11-07", today)).toBe(true);
    expect(isEditableLogDate("2025-11-06", today)).toBe(false);
    expect(isEditableLogDate("2026-11-09", today)).toBe(true);
    expect(isEditableLogDate("2026-11-10", today)).toBe(false);
    expect(isEditableLogDate("2026-11-8", today)).toBe(false);
    expect(isEditableLogDate(undefined, today)).toBe(false);
  });
});

describe("buildLiftHistory", () => {
  it("種目ごとに古い順に並べ、推定1RM を更新した日に印を付ける", () => {
    const history = buildLiftHistory([
      { item: "sq", value: 100, rm: 3, measuredOn: "2026-11-20" },
      { item: "sq", value: 100, rm: 3, measuredOn: "2026-10-01" },
      { item: "sq", value: 105, rm: 1, measuredOn: "2026-11-01" },
      { item: "bw", value: 70, rm: null, measuredOn: "2026-10-01" },
      { item: "bp", value: 60, rm: 1, measuredOn: "2026-10-05" },
    ]);
    expect(history.sq.map((point) => [point.date, point.estimated, point.isBest])).toEqual([
      ["2026-10-01", 110.00000000000001, true],
      ["2026-11-01", 105, false],
      ["2026-11-20", 110.00000000000001, false],
    ]);
    expect(history.bp).toHaveLength(1);
    expect(history.dl).toEqual([]);
  });
});
