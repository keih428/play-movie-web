import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMyClips,
  countMemberPlays,
  countMySkills,
  estimateServeDelaySeconds,
  findOwnSide,
  getOwnSetScore,
  normalizeShirtNumber,
  SKILL_CLIP_AFTER_SECONDS,
  SKILL_CLIP_BEFORE_SECONDS,
} from "@/lib/domain/my-plays";
import type { ParsedMatch, VideoSyncSettings } from "@/lib/domain/types";
import { parseVsmText } from "@/lib/parsers/vsm";

const settings: VideoSyncSettings = { youtubeUrl: "https://youtu.be/abc", offsetSeconds: 10, prerollSeconds: 0 };

// 小さな試合:東大がアウェー。1ラリー目は東大の5番がレシーブ・14番が決める、2ラリー目は5番のサーブミス。
function sampleMatch(): ParsedMatch {
  const lineup = { home: { positions: {} }, away: { positions: {} } };
  return {
    id: "m1",
    sourceType: "vsm",
    fileName: "t.vsm",
    teams: { home: { name: "東北学院工学部" }, away: { name: "東京大学" } },
    sets: [
      {
        id: "s1",
        setIndex: 1,
        score: { home: 20, away: 25 },
        events: [
          {
            id: "e1",
            eventIndex: 0,
            score: { home: 0, away: 1 },
            point: "a",
            lineup,
            plays: [
              { id: "p1", team: "*", player: "03", skill: "S", effect: "-", time: 1000 },
              { id: "p2", team: "a", player: "05", skill: "R", effect: "#", time: 1015 },
              { id: "p3", team: "a", player: "14", skill: "A", effect: "#", time: 1040 },
            ],
          },
          {
            id: "e2",
            eventIndex: 1,
            score: { home: 1, away: 1 },
            point: "*",
            lineup,
            plays: [{ id: "p4", team: "a", player: "5", skill: "S", effect: "=", time: 1200 }],
          },
          {
            id: "e3",
            eventIndex: 2,
            score: { home: 1, away: 1 },
            lineup,
            // 相手の5番(東大ではない)
            plays: [{ id: "p5", team: "*", player: "05", skill: "S", effect: "+", time: 1300 }],
          },
        ],
      },
    ],
  };
}

describe("マイプレー", () => {
  it("背番号を比べられる形にする", () => {
    expect(normalizeShirtNumber("05")).toBe("5");
    expect(normalizeShirtNumber(15)).toBe("15");
    expect(normalizeShirtNumber("T")).toBeNull();
    expect(normalizeShirtNumber(null)).toBeNull();
  });

  it("東大がどちらの側かを、チーム名で見分ける", () => {
    expect(findOwnSide(sampleMatch())).toBe("away");
    const other = { ...sampleMatch(), teams: { home: { name: "ウェルネス東京" }, away: { name: "帝京" } } };
    expect(findOwnSide(other)).toBeUndefined();
  });

  it("自分のプレーだけを数える(相手の同じ背番号は数えない)", () => {
    const match = sampleMatch();
    expect(countMemberPlays(match, "away", "5")).toBe(2);
    expect(countMySkills(match, "away", "5")).toEqual({ R: 1, S: 1 });
    expect(getOwnSetScore(match, "away")).toEqual({ own: 1, opponent: 0 });
  });

  it("スキルだけの見方:触った瞬間の前後を切り取る", () => {
    const clips = buildMyClips({ match: sampleMatch(), settings, side: "away", number: "5", mode: "skill" });
    expect(clips.map((clip) => clip.plays[0].skill)).toEqual(["R", "S"]);
    // セットの最初のプレー(100秒)を0秒として、オフセット10秒。レシーブは101.5秒 → 11.5秒、2秒前から。
    expect(clips[0].seekSeconds).toBeCloseTo(9.5);
    expect(clips[0].durationSeconds).toBe(SKILL_CLIP_BEFORE_SECONDS + SKILL_CLIP_AFTER_SECONDS);
    // 点数は自チーム - 相手、ラリーの前の点数。1ラリー目は取った、2ラリー目は落とした。
    expect(clips[0]).toMatchObject({ score: { own: 0, opponent: 0 }, won: true });
    expect(clips[1]).toMatchObject({ score: { own: 1, opponent: 0 }, won: false });
  });

  it("ラリー全体の見方:サーブの2秒前から、最後のプレーの3秒後まで", () => {
    const clips = buildMyClips({ match: sampleMatch(), settings, side: "away", number: "5", mode: "rally" });
    expect(clips).toHaveLength(2);
    expect(clips[0].seekSeconds).toBeCloseTo(8);
    // 最後のプレー(104秒 → 14秒)の3秒後 = 17秒まで
    expect(clips[0].durationSeconds).toBeCloseTo(9);
    expect(clips[0].plays.map((play) => play.skill)).toEqual(["R"]);
  });

  it("スキルで絞る", () => {
    const clips = buildMyClips({ match: sampleMatch(), settings, side: "away", number: "5", mode: "rally", skills: ["S"] });
    expect(clips.map((clip) => clip.key)).toEqual(["s1-e2"]);
  });

  it("映像のない試合では、切り取りを作らない", () => {
    const clips = buildMyClips({
      match: sampleMatch(),
      settings: { ...settings, youtubeUrl: "" },
      side: "away",
      number: "5",
      mode: "skill",
    });
    expect(clips).toEqual([]);
  });

  it("サーブの記録が早い試合では、スキルだけの見方のサーブを後ろにずらす", () => {
    // サーブ → レシーブが毎回4秒(本当は1.2秒くらい)= サーブの記録が2.8秒早い
    const lineup = { home: { positions: {} }, away: { positions: {} } };
    const events = Array.from({ length: 6 }, (_, index) => ({
      id: `e${index}`,
      eventIndex: index,
      score: { home: 0, away: index },
      point: "a",
      lineup,
      plays: [
        { id: `s${index}`, team: "a", player: "5", skill: "S", effect: "-", time: 1000 + index * 300 },
        { id: `r${index}`, team: "*", player: "3", skill: "R", effect: "+", time: 1040 + index * 300 },
      ],
    }));
    const match: ParsedMatch = { ...sampleMatch(), sets: [{ id: "s1", setIndex: 1, score: { home: 0, away: 6 }, events }] };
    expect(estimateServeDelaySeconds(match)).toBeCloseTo(2.8);
    const clips = buildMyClips({ match, settings, side: "away", number: "5", mode: "skill" });
    // サーブ(100秒 → 10秒)の 2秒前 ではなく、2.8秒遅らせて 10.8秒から
    expect(clips[0].seekSeconds).toBeCloseTo(10.8);
    // ラリー全体の見方は、今までどおりサーブの2秒前から
    expect(buildMyClips({ match, settings, side: "away", number: "5", mode: "rally" })[0].seekSeconds).toBeCloseTo(8);
    // 記録が正しい試合(サーブ → 次が1.2秒くらい)は、ずらさない
    expect(estimateServeDelaySeconds(sampleMatch())).toBe(0);
  });

  it("本物の試合(2026-06-24 東大 vs 東北学院工学部)", () => {
    const file = path.join(process.cwd(), "vsm", "2026-06-24 UTVB-TIT.vsm");
    const match = parseVsmText(readFileSync(file, "utf8"), "UTVB-TIT.vsm").matches[0];
    expect(findOwnSide(match)).toBe("home");
    const attacks = countMySkills(match, "home", "14").A ?? 0;
    expect(attacks).toBeGreaterThan(0);
    const clips = buildMyClips({ match, settings, side: "home", number: "14", mode: "skill", skills: ["A"] });
    expect(clips.length).toBeGreaterThan(0);
    expect(clips.every((clip) => clip.plays[0].skill === "A")).toBe(true);
    expect(estimateServeDelaySeconds(match)).toBe(0);
    // 試合に出ていない背番号は0
    expect(countMemberPlays(match, "home", "99")).toBe(0);
  });
});
