import { describe, expect, it } from "vitest";
import {
  buildMatchTeamSummary,
  formatEffectRate,
  formatWinRate,
} from "@/lib/domain/match-team-summary";
import type { ParsedEvent, ParsedMatch, ParsedPlay } from "@/lib/domain/types";

// 東大がアウェー("a")。setterAt が東大のローテ。
function event(
  id: string,
  setterAt: number,
  point: "*" | "a",
  plays: Omit<ParsedPlay, "id" | "time">[],
): ParsedEvent {
  return {
    id,
    eventIndex: 0,
    score: { home: 0, away: 0 },
    point,
    lineup: { home: { positions: {} }, away: { positions: {}, setterAt } },
    plays: plays.map((play, index) => ({
      ...play,
      id: `${id}-${index}`,
      time: 0,
    })),
  } as ParsedEvent;
}

function sampleMatch(): ParsedMatch {
  return {
    id: "m1",
    sourceType: "vsm",
    fileName: "t.vsm",
    teams: { home: { name: "相手" }, away: { name: "東京大学" } },
    sets: [
      {
        id: "s1",
        setIndex: 1,
        score: { home: 0, away: 0 },
        events: [
          // S1:サイドアウト成功
          event("e1", 1, "a", [
            { team: "*", player: "3", skill: "S", effect: "-" },
            { team: "a", player: "5", skill: "R", effect: "#" },
          ]),
          // S1:ブレイク失敗(5番のサーブミス)
          event("e2", 1, "*", [
            { team: "a", player: "5", skill: "S", effect: "=" },
          ]),
          // S2:ブレイク成功(14番のエース)
          event("e3", 2, "a", [
            { team: "a", player: "14", skill: "S", effect: "#" },
          ]),
          // S2:ブレイク(14番の効果サーブ、でも失点)
          event("e4", 2, "*", [
            { team: "a", player: "14", skill: "S", effect: "!" },
          ]),
          // S2:サイドアウト失敗
          event("e5", 2, "*", [
            { team: "*", player: "3", skill: "S", effect: "-" },
            { team: "a", player: "5", skill: "R", effect: "-" },
          ]),
        ],
      },
    ],
  } as ParsedMatch;
}

describe("試合のチームのまとめ", () => {
  it("ローテ別にサイドアウトとブレイクを数える(S1 から順に)", () => {
    const summary = buildMatchTeamSummary(sampleMatch(), "away");
    expect(summary.rotations).toEqual([
      {
        label: "S1",
        sideoutWins: 1,
        sideoutAttempts: 1,
        breakWins: 0,
        breakAttempts: 1,
      },
      {
        label: "S2",
        sideoutWins: 0,
        sideoutAttempts: 1,
        breakWins: 1,
        breakAttempts: 2,
      },
    ]);
    expect(summary.rotationTotal).toMatchObject({
      sideoutWins: 1,
      sideoutAttempts: 2,
      breakWins: 1,
      breakAttempts: 3,
    });
  });

  it("サーブは効果率の高い順。相手のサーブは数えない", () => {
    const summary = buildMatchTeamSummary(sampleMatch(), "away");
    expect(
      summary.servePlayers.map((row) => [row.number, row.effectRate]),
    ).toEqual([
      ["14", 62.5],
      ["5", -25],
    ]);
    expect(summary.serveTeam).toMatchObject({
      number: null,
      attempts: 3,
      aces: 1,
      effective: 1,
      misses: 1,
    });
  });

  it("率の書き方", () => {
    expect(formatWinRate(3, 5)).toBe("60%(3/5)");
    expect(formatWinRate(0, 0)).toBe("-");
    expect(formatEffectRate(12.5)).toBe("12.5%");
    expect(formatEffectRate(null)).toBe("-");
  });
});
