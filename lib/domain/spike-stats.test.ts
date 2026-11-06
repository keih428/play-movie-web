import { describe, expect, it } from "vitest";
import {
  formatSpikeRate,
  normalizeSpikeLevel,
  parseSpikeSetup,
  rankSetters,
  rankSpikers,
  splitSpikeTeams,
  toggleShownSetter,
  type SpikeCount,
} from "@/lib/domain/spike-stats";

const count = (entry: Partial<SpikeCount> & Pick<SpikeCount, "memberId" | "kills" | "attempts">): SpikeCount => ({
  setterId: "sA",
  spot: "OH",
  level: 3,
  ...entry,
});

describe("スパイク練習の集計", () => {
  it("サーブのレベルは前衛 OH・OP だけ。ほかは 0", () => {
    expect(normalizeSpikeLevel("OH", 2)).toBe(2);
    expect(normalizeSpikeLevel("OP", 4)).toBeNull();
    expect(normalizeSpikeLevel("MB", 3)).toBe(0);
    expect(normalizeSpikeLevel("pipe", undefined)).toBe(0);
  });

  it("スパイカーの順位は位置・レベルごと。規定打数に届かない人は対象外で下に", () => {
    const tables = rankSpikers([
      count({ memberId: "a", setterId: "sA", kills: 12, attempts: 20 }),
      count({ memberId: "a", setterId: "sB", kills: 10, attempts: 15 }),
      count({ memberId: "b", kills: 19, attempts: 35 }),
      count({ memberId: "c", kills: 9, attempts: 10 }),
      count({ memberId: "d", level: 2, kills: 27, attempts: 40 }),
      count({ memberId: "e", spot: "MB", level: 0, kills: 26, attempts: 40 }),
    ]);
    expect(tables.map((table) => `${table.spot}${table.level}`)).toEqual(["OH3", "OH2", "MB0"]);
    const oh3 = tables[0].rows;
    expect(oh3.map((row) => [row.memberId, row.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", null],
    ]);
    expect(oh3[0].bySetter.get("sB")).toEqual({ kills: 10, attempts: 15 });
    expect(formatSpikeRate(oh3[0].kills, oh3[0].attempts)).toBe("62.9%");
  });

  it("同じ決定率は同じ順位", () => {
    const [table] = rankSpikers([
      count({ memberId: "a", kills: 10, attempts: 20 }),
      count({ memberId: "b", kills: 15, attempts: 30 }),
      count({ memberId: "c", kills: 5, attempts: 20 }),
    ]);
    expect(table.rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it("セッターは位置ごとの決定/打数と、合計の決定率で順位", () => {
    const ranking = rankSetters([
      count({ memberId: "a", setterId: "sA", kills: 40, attempts: 70 }),
      count({ memberId: "a", setterId: "sB", kills: 38, attempts: 70 }),
      count({ memberId: "b", setterId: "sA", spot: "pipe", level: 0, kills: 20, attempts: 35 }),
      count({ memberId: "b", setterId: "sB", spot: "pipe", level: 0, kills: 18, attempts: 35 }),
    ]);
    expect(ranking.setterIds).toEqual(["sA", "sB"]);
    expect(ranking.ranks.get("sA")).toBe(1);
    expect(ranking.totals.get("sB")).toEqual({ kills: 56, attempts: 105 });
    expect(ranking.bySpot.get("pipe")?.get("sA")).toEqual({ kills: 20, attempts: 35 });
  });

  it("前半・後半はポジションが偏らないように分ける(セッター・リベロは入れない)", () => {
    const teams = splitSpikeTeams([
      { id: "oh1", position: "OH" },
      { id: "oh2", position: "OH" },
      { id: "oh3", position: "OH" },
      { id: "oh4", position: "OH" },
      { id: "mb1", position: "MB" },
      { id: "mb2", position: "MB" },
      { id: "op1", position: "OP" },
      { id: "op2", position: "OP" },
      { id: "s1", position: "S" },
      { id: "li", position: "Li" },
    ]);
    const first = Object.keys(teams).filter((id) => teams[id] === "first");
    expect(first).toEqual(["oh1", "oh3", "op1", "mb1"]);
    expect(teams.s1).toBeUndefined();
    expect(teams.li).toBeUndefined();
  });
});

describe("スパイク練習の組み方(共有)", () => {
  it("形の合わないところは捨てて読む", () => {
    expect(parseSpikeSetup(null)).toBeNull();
    expect(parseSpikeSetup([])).toBeNull();
    expect(
      parseSpikeSetup({
        teams: { a: "first", b: "second", c: "third" },
        setters: ["s1", "s1", 3, "s2"],
        levels: { a: 2 },
      }),
    ).toEqual({ teams: { a: "first", b: "second" }, setters: ["s1", "s2"] });
  });

  it("画面に並べるセッターは3人まで。4人目を足すと、いちばん前に選んだ人が外れる", () => {
    expect(toggleShownSetter(["s1", "s2"], "s3")).toEqual(["s1", "s2", "s3"]);
    expect(toggleShownSetter(["s1", "s2", "s3"], "s4")).toEqual(["s2", "s3", "s4"]);
    expect(toggleShownSetter(["s1", "s2"], "s1")).toEqual(["s2"]);
  });
});
