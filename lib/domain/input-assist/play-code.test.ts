import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPlayCode, type PlayCodeInput } from "@/lib/domain/input-assist/play-code";

const SAMPLE_PATH = path.resolve(__dirname, "../../../vsm/2026-06-24 UTVB-TIT.vsm");

describe("打ち込み補助:プレーの code(田中の書き方)", () => {
  it("サーブ:H は省き、ゾーンを並べて . で終わる。ミスは = とミスの種類", () => {
    expect(buildPlayCode({ team: "a", player: "02", skill: "S", hitType: "M", effect: "-" })).toBe("a2SM.");
    expect(
      buildPlayCode({ team: "a", player: 2, skill: "S", hitType: "M", effect: "+", startZone: 9, endZone: 5, endSubZone: "B" }),
    ).toBe("a2SM95B.");
    expect(buildPlayCode({ team: "*", player: 5, skill: "S", hitType: "H", effect: "+", startZone: 5, endZone: 6, endSubZone: "A" })).toBe(
      "5S56A.",
    );
    expect(
      buildPlayCode({ team: "*", player: 24, skill: "S", hitType: "H", effect: "=", startZone: 5, endZone: 6, endSubZone: "A", special: "O" }),
    ).toBe("24S56A=,O");
  });

  it("レセプションは頭に . 、評価 + は省く", () => {
    expect(buildPlayCode({ team: "*", player: "07", skill: "R", effect: "!" })).toBe(".7!");
    expect(buildPlayCode({ team: "a", player: 3, skill: "R", effect: "+" })).toBe(".3");
  });

  it("トスはセッターコールがあればそれだけ。なければ = と / だけ付ける", () => {
    expect(buildPlayCode({ team: "*", player: 29, skill: "E", effect: "+", combination: "KB" })).toBe("KB");
    expect(buildPlayCode({ team: "a", player: 13, skill: "E", effect: "+" })).toBe("a13E");
    expect(buildPlayCode({ team: "*", player: 14, skill: "E", effect: "/" })).toBe("14E/");
  });

  it("アタックはコンビ+. 。終わりのゾーンがあれば評価で終わる。ミスはいつも書く", () => {
    expect(buildPlayCode({ team: "*", player: 14, skill: "A", effect: "+", combination: "PV" })).toBe("14APV.");
    expect(buildPlayCode({ team: "a", player: 12, skill: "A", effect: "#", combination: "PB", endZone: 8, endSubZone: "B" })).toBe(
      "a12APB8B#",
    );
    expect(buildPlayCode({ team: "*", player: 24, skill: "A", effect: "=", combination: "PA" })).toBe("24APA=");
  });

  it("ブロックは頭に . 、評価 / は省く", () => {
    expect(buildPlayCode({ team: "*", player: 29, skill: "B", effect: "=" })).toBe(".29=");
    expect(buildPlayCode({ team: "a", player: 5, skill: "B", effect: "/" })).toBe(".5");
  });

  it("ディグは直前が相手のプレーなら頭に . 、同じチームならチームの記号", () => {
    expect(buildPlayCode({ team: "*", player: 13, skill: "D", effect: "+" }, { team: "a" })).toBe(".13D");
    expect(buildPlayCode({ team: "a", player: 5, skill: "D", effect: "+" }, { team: "a" })).toBe("a5D");
    expect(buildPlayCode({ team: "a", player: 11, skill: "D", effect: "=" }, { team: "a" })).toBe("a11D=");
  });

  it("フリーボールは = と / だけ付ける", () => {
    expect(buildPlayCode({ team: "a", player: 11, skill: "F", effect: "+" })).toBe("a11F");
    expect(buildPlayCode({ team: "a", player: 5, skill: "F", effect: "/" })).toBe("a5F/");
  });

  it("本物の VSM のプレーと、スキルごとにどれだけ同じになるか", () => {
    const sample = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as {
      scout: { sets: Array<{ events: Array<{ exchange?: { plays: Array<Record<string, unknown>> } }> }> };
    };
    const tally = new Map<string, { same: number; total: number }>();
    for (const set of sample.scout.sets) {
      for (const event of set.events) {
        const plays = event.exchange?.plays ?? [];
        plays.forEach((play, index) => {
          if (typeof play.code !== "string") {
            return;
          }
          const input = play as unknown as PlayCodeInput;
          const previous = index > 0 ? (plays[index - 1] as unknown as PlayCodeInput) : undefined;
          const entry = tally.get(input.skill) ?? { same: 0, total: 0 };
          entry.total += 1;
          if (buildPlayCode(input, previous) === play.code) {
            entry.same += 1;
          }
          tally.set(input.skill, entry);
        });
      }
    }
    const rates = Object.fromEntries(
      [...tally.entries()].map(([skill, { same, total }]) => [skill, `${same}/${total} (${Math.round((same / total) * 100)}%)`]),
    );
    console.log("[play-code] 本物の VSM と同じになった割合", rates);
    const all = [...tally.values()].reduce(
      (sum, entry) => ({ same: sum.same + entry.same, total: sum.total + entry.total }),
      { same: 0, total: 0 },
    );
    expect(all.total).toBeGreaterThan(900);
    expect(all.same / all.total).toBeGreaterThan(0.3);
  });
});
