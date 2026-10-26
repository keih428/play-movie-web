import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTeamPlays } from "@/lib/domain/analysis";
import { normalizeShirtNumber } from "@/lib/domain/my-plays";
import { buildMatchNoteTemplate, buildMyStats, buildMyTrend, matchesStatFilter } from "@/lib/domain/my-stats";
import { parseVsmText } from "@/lib/parsers/vsm";

const match = parseVsmText(
  readFileSync(path.join(process.cwd(), "vsm", "2026-06-24 UTVB-TIT.vsm"), "utf8"),
  "UTVB-TIT.vsm",
).matches[0];
const matches = [{ match, side: "home" as const }];
const myPlays = (number: string) =>
  getTeamPlays(match, "home").filter((play) => normalizeShirtNumber(play.player) === number);

describe("マイプレーの成績", () => {
  it("ポジションで並びを変え、プレーのないスキルは出さない", () => {
    const oh = buildMyStats({ matches, number: "14", position: "OH" });
    expect(oh[0].key).toBe("attack");
    expect(oh.every((section) => section.attempts > 0)).toBe(true);
    const li = buildMyStats({ matches, number: "13", position: "Li" }); // この試合のリベロは13番
    expect(li[0].key).toBe("reception");
    // リベロでもアタックがあれば出すが、レシーブ・ディグより後ろ
    expect(li.map((section) => section.key).slice(0, 2)).toEqual(["reception", "dig"]);
    // 試合に出ていない背番号は、何も出さない
    expect(buildMyStats({ matches, number: "99", position: "OH" })).toEqual([]);
  });

  it("数字と、押したときに絞られるプレーの数がそろう", () => {
    for (const number of ["14", "13", "29", "24", "7"]) {
      const plays = myPlays(number);
      for (const section of buildMyStats({ matches, number, position: null })) {
        for (const item of section.items) {
          if (!item.filter) {
            continue;
          }
          const shown = Number(item.value.split("(")[0]);
          if (Number.isNaN(shown)) {
            continue;
          }
          expect(plays.filter((play) => matchesStatFilter(play, item.filter!)).length, `${number} ${section.title} ${item.label}`).toBe(shown);
        }
        for (const course of section.courses ?? []) {
          expect(plays.filter((play) => matchesStatFilter(play, course.filter)).length).toBe(course.attempts);
        }
      }
    }
  });

  it("アタックの数字は、総合分析と同じ計算(決定率 = 決まった数 / 打数)", () => {
    const plays = myPlays("14").filter((play) => play.skill === "A");
    const kills = plays.filter((play) => play.effect === "#").length;
    const attack = buildMyStats({ matches, number: "14", position: "OH" }).find((section) => section.key === "attack")!;
    expect(attack.attempts).toBe(plays.length);
    const rate = Math.round((kills / plays.length) * 1000) / 10;
    expect(attack.items.find((item) => item.label === "決定率")!.value).toBe(`${rate}%`);
    expect(attack.items.find((item) => item.label === "決定率")!.team).toMatch(/%$/);
  });

  it("複数の試合を合わせられる", () => {
    const one = buildMyStats({ matches, number: "14", position: "OH" })[0].attempts;
    const two = buildMyStats({ matches: [...matches, ...matches], number: "14", position: "OH" })[0].attempts;
    expect(two).toBe(one * 2);
  });

  it("試合ごとの推移:列はポジション順の先頭3つ、行は試合ごと", () => {
    const trend = buildMyTrend({
      matches: [
        { match, side: "home", workspaceId: "a", label: "6/24 vs 東北学院" },
        { match, side: "home", workspaceId: "b", label: "6/24(2)" },
      ],
      number: "14",
      position: "OH",
    });
    expect(trend.columns.map((column) => column.key)).toEqual(["attack", "serve", "reception"]);
    expect(trend.rows).toHaveLength(2);
    const attack = buildMyStats({ matches, number: "14", position: "OH" })[0];
    expect(trend.rows[0].values[0]).toBe(attack.items.find((item) => item.label === "決定率")!.value);
    expect(trend.rows[0].values[2]).toMatch(/%$/);
  });

  it("ノートの下書きに、試合と自分の数字を入れる", () => {
    const text = buildMatchNoteTemplate({ title: "6/24 vs 東北学院工学部(0-3)", sections: buildMyStats({ matches, number: "14", position: "OH" }) });
    expect(text.split("\n")[0]).toBe("【試合の振り返り】6/24 vs 東北学院工学部(0-3)");
    expect(text).toContain("・アタック(31本):決定率");
    expect(text).toContain("次に直すこと:");
  });

  it("落ちた場所のゾーンの本数(ヒートマップ)は、ゾーンのあるアタックの数とそろう", () => {
    const attack = buildMyStats({ matches, number: "14", position: "OH" }).find((section) => section.key === "attack")!;
    const withZone = myPlays("14").filter((play) => play.skill === "A" && typeof play.endZone === "number");
    expect(attack.zones!.reduce((sum, zone) => sum + zone.count, 0)).toBe(withZone.length);
    expect(attack.zones!.map((zone) => zone.zone)).toEqual([4, 3, 2, 7, 8, 9, 5, 6, 1]);
  });
});
