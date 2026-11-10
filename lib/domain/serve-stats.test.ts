import { describe, expect, it } from "vitest";
import {
  formatServeEfficiency,
  isServer,
  parseServeSetup,
  rankServes,
  serveEfficiency,
  splitServeTeams,
  type ServeCount,
} from "@/lib/domain/serve-stats";

// エース(#)・効果(+)・入った(!)・ミス(=)の数から作る(/ と - は別のテストで)。
const count = (memberId: string, ace: number, effect: number, inPlay: number, miss: number): ServeCount => ({
  memberId,
  "#": ace,
  "+": effect,
  "!": inPlay,
  "-": 0,
  "/": 0,
  "=": miss,
});

describe("serveEfficiency", () => {
  it("(エース×100 + 効果×25 − ミス×25)÷ 打数", () => {
    // (2×100 + 4×25 − 2×25)÷ 20 = 12.5
    expect(serveEfficiency(count("a", 2, 4, 12, 2))).toBe(12.5);
    expect(formatServeEfficiency(count("a", 2, 4, 12, 2))).toBe("12.5%");
  });

  it("/(直接返ってきた)は効果、-(Aパス)は数に入れない", () => {
    // (2×25)÷ 4 = 12.5
    expect(serveEfficiency({ "#": 0, "+": 1, "!": 0, "-": 2, "/": 1, "=": 0 })).toBe(12.5);
  });

  it("ミスが多いとマイナスになる", () => {
    expect(serveEfficiency(count("a", 0, 0, 2, 2))).toBe(-12.5);
  });

  it("打数が0なら null", () => {
    expect(serveEfficiency(count("a", 0, 0, 0, 0))).toBeNull();
    expect(formatServeEfficiency(count("a", 0, 0, 0, 0))).toBe("—");
  });
});

describe("rankServes", () => {
  it("同じ人のメニューを足し、効果率の高い順。規定の打数に届かない人は下に対象外", () => {
    const rows = rankServes(
      [count("a", 1, 0, 9, 0), count("a", 0, 0, 10, 0), count("b", 0, 4, 16, 0), count("c", 5, 0, 0, 0)],
      20,
    );
    expect(rows.map((row) => [row.memberId, row.attempts, row.rank])).toEqual([
      ["a", 20, 1],
      ["b", 20, 1],
      ["c", 5, null],
    ]);
  });

  it("効果率が違えば順位も分かれる", () => {
    const rows = rankServes([count("a", 0, 0, 20, 0), count("b", 0, 0, 19, 1)], 20);
    expect(rows.map((row) => [row.memberId, row.rank])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("isServer", () => {
  it("リベロとスタッフは打たない", () => {
    expect(isServer("OH")).toBe(true);
    expect(isServer("S")).toBe(true);
    expect(isServer("Li")).toBe(false);
    expect(isServer(null)).toBe(false);
  });
});

describe("splitServeTeams", () => {
  it("ポジションごとに前半・後半へ交互に分け、リベロは入れない", () => {
    const teams = splitServeTeams([
      { id: "oh1", position: "OH" },
      { id: "oh2", position: "OH" },
      { id: "mb1", position: "MB" },
      { id: "s1", position: "S" },
      { id: "s2", position: "S" },
      { id: "li", position: "Li" },
    ]);
    expect(teams).toEqual({ oh1: "first", oh2: "second", mb1: "first", s1: "second", s2: "first" });
  });
});

describe("parseServeSetup", () => {
  it("前半・後半以外は捨てる", () => {
    expect(parseServeSetup({ teams: { a: "first", b: "second", c: "x" } })).toEqual({
      teams: { a: "first", b: "second" },
    });
    expect(parseServeSetup(null)).toBeNull();
    expect(parseServeSetup({ teams: [] })).toBeNull();
  });
});
