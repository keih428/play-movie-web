import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeSet, rotateLineup } from "@/lib/domain/input-assist/engine";
import { setsFromVsmMatch } from "@/lib/domain/input-assist/roster";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import type { IaSet } from "@/lib/domain/input-assist/types";

type RawEvent = {
  lineup: Record<"home" | "away", { positions: Record<string, number> }>;
  exchange?: { plays: Array<{ team: string; skill: string }> };
  substitution?: unknown;
};
type RawSet = {
  startingLineup: IaSet["startingLineup"];
  score: { home: number; away: number };
  events: RawEvent[];
};

const SAMPLE_PATH = path.resolve(__dirname, "../../../vsm/2026-06-24 UTVB-TIT.vsm");
const sample = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as Record<string, unknown> & {
  scout: { sets: RawSet[] };
};

function rallyEvents(set: RawSet) {
  return set.events.filter((event) => event.exchange);
}

function servingTeamOfEvent(event: RawEvent): "home" | "away" {
  return event.exchange!.plays[0].team === "a" ? "away" : "home";
}

describe("打ち込み補助:ローテーション", () => {
  it("2 の位置の選手が 1 へ、セッターの位置は 1 つ減る(1 の次は 6)", () => {
    const rotated = rotateLineup({
      positions: { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 },
      setterAt: 1,
    });
    expect(rotated.positions).toEqual({ "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 1 });
    expect(rotated.setterAt).toBe(6);
  });
});

describe("打ち込み補助:本物の VSM で検証(2026-06-24 UTVB-TIT)", () => {
  sample.scout.sets.forEach((rawSet, setIndex) => {
    it(`${setIndex + 1}セット目:サーブの順だけから、最終スコアとサーバーが合う(交代の前まで)`, () => {
      const events = rallyEvents(rawSet);
      const set: IaSet = {
        ...createEmptySet(setIndex + 1),
        startingLineup: rawSet.startingLineup,
        finalScore: { ...rawSet.score },
        rallies: events.map((event, index) => ({
          id: `r${index}`,
          serveTime: index * 30,
          side: servingTeamOfEvent(event) === "home" ? "near" : "far",
          status: "rally",
          source: "auto",
        })),
      };
      const result = computeSet(set);
      expect(result.score).toEqual(rawSet.score);
      expect(result.scoreMatches).toBe(true);
      expect(result.countMatches).toBe(true);

      const firstSubstitution = rawSet.events.findIndex((event) => event.substitution);
      const beforeSubstitution = rawSet.events
        .slice(0, firstSubstitution === -1 ? undefined : firstSubstitution)
        .filter((event) => event.exchange).length;
      expect(beforeSubstitution).toBeGreaterThan(10);
      for (let index = 0; index < beforeSubstitution; index += 1) {
        const event = events[index];
        const team = servingTeamOfEvent(event);
        expect(result.rallies[index].server).toBe(event.lineup[team].positions["1"]);
      }
    });

    it(`${setIndex + 1}セット目:交代も入れると、すべてのラリーで並びが合う`, () => {
      const [set] = setsFromVsmMatch({ scout: { sets: [rawSet] } });
      expect(set.substitutions.length).toBeGreaterThan(0);
      const result = computeSet(set);
      const events = rallyEvents(rawSet);
      expect(result.rallies).toHaveLength(events.length);
      events.forEach((event, index) => {
        expect(result.rallies[index].lineup.home.positions).toEqual(event.lineup.home.positions);
        expect(result.rallies[index].lineup.away.positions).toEqual(event.lineup.away.positions);
      });
      expect(result.score).toEqual(rawSet.score);
    });
  });
});

describe("打ち込み補助:途中の状態", () => {
  it("サーブの向きが決まっていないラリーとラリーでないものは数えない", () => {
    const set: IaSet = {
      ...createEmptySet(1),
      finalScore: { home: 2, away: 1 },
      rallies: [
        { id: "a", serveTime: 10, side: "near", status: "rally", source: "auto" },
        { id: "b", serveTime: 40, side: null, status: "rally", source: "auto" },
        { id: "c", serveTime: 70, side: "far", status: "rally", source: "auto" },
        { id: "d", serveTime: 90, side: "far", status: "not_rally", source: "auto" },
      ],
    };
    const result = computeSet(set);
    expect(result.countedRallies).toBe(2);
    expect(result.undecidedRallies).toBe(1);
    expect(result.requiredRallies).toBe(3);
    expect(result.countMatches).toBe(false);
    expect(result.rallies.map((rally) => rally.pointWinner)).toEqual(["away", "home"]);
  });

  it("手前がアウェイのセットでは、near はアウェイのサーブ", () => {
    const set: IaSet = {
      ...createEmptySet(1),
      nearTeam: "away",
      rallies: [{ id: "a", serveTime: 10, side: "near", status: "rally", source: "auto" }],
    };
    expect(computeSet(set).rallies[0].servingTeam).toBe("away");
  });

  it("最終スコアがないときの最後のラリーは推し量りの印を付ける", () => {
    const set: IaSet = {
      ...createEmptySet(1),
      rallies: [{ id: "a", serveTime: 10, side: "far", status: "rally", source: "auto" }],
    };
    const result = computeSet(set);
    expect(result.rallies[0].pointGuessed).toBe(true);
    expect(result.scoreMatches).toBeNull();
  });
});
