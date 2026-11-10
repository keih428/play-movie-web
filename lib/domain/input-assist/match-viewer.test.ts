import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMatchViewerSettings, firstPlaySeconds } from "@/lib/domain/input-assist/match-viewer";
import { readScoutRosterFile, setsFromVsmMatch } from "@/lib/domain/input-assist/roster";
import type { InputAssistSession } from "@/lib/domain/input-assist/types";
import { buildVsmFileName, buildVsmText } from "@/lib/domain/input-assist/vsm-writer";
import { calculateSeekSeconds, getVideoSourceForSet } from "@/lib/domain/video";
import { parseVsmText } from "@/lib/parsers/vsm";

const sampleText = readFileSync(path.resolve(__dirname, "../../../vsm/2026-06-24 UTVB-TIT.vsm"), "utf8");

function sampleSession(): InputAssistSession {
  const match = readScoutRosterFile(sampleText, "sample.vsm").matches[0];
  return {
    id: "s1",
    teamSlug: "utvb",
    title: "東北学院工学部戦",
    date: "2026-06-24",
    opponent: "東北学院工学部",
    teams: match.teams,
    extras: match.extras,
    // セットごとに別の動画(URL)にする
    sets: setsFromVsmMatch(match.raw).map((set) => ({ ...set, youtubeUrl: `https://youtu.be/video${set.setIndex}` })),
    passLogs: [],
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}

describe("打ち込み補助:試合ビューアの動画の設定", () => {
  it("どのプレーも、seek = play.time / 10(VSM の時刻 = そのセットの動画の秒)になる", () => {
    const session = sampleSession();
    const match = parseVsmText(buildVsmText(session), buildVsmFileName(session)).matches[0];
    const settings = buildMatchViewerSettings(session.sets, match);
    let checked = 0;
    for (const set of match.sets) {
      for (const event of set.events) {
        for (const play of event.plays) {
          if (typeof play.time !== "number") {
            continue;
          }
          expect(calculateSeekSeconds(play, settings, match)).toBeCloseTo(play.time / 10, 6);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(settings.setVideos?.every((entry) => entry.offsetMode === "set")).toBe(true);
  });

  it("打たないセットは VSM にないので、試合ビューアのセットの番号は打つセットだけで数え直す", () => {
    const session = sampleSession();
    session.sets[0] = { ...session.sets[0], skipped: true };
    const match = parseVsmText(buildVsmText(session), buildVsmFileName(session)).matches[0];
    const settings = buildMatchViewerSettings(session.sets, match);
    expect(settings.setVideos?.map((entry) => entry.setIndex)).toEqual(match.sets.map((set) => set.setIndex));
    // 試合ビューアの 1 セット目 = 打ち込み補助の 2 セット目の動画
    expect(getVideoSourceForSet(settings, 1).youtubeUrl).toBe("https://youtu.be/video2");
    expect(settings.youtubeUrl).toBe("https://youtu.be/video2");
    const play = match.sets[0].events.flatMap((event) => event.plays).find((entry) => typeof entry.time === "number");
    expect(play).toBeDefined();
    expect(calculateSeekSeconds(play!, settings, match)).toBeCloseTo(play!.time! / 10, 6);
    expect(settings.setVideos?.[0].offsetSeconds).toBe(firstPlaySeconds(match, 1));
  });

  it("再生の前の秒(preroll)は、そのぶん前から流す", () => {
    const session = sampleSession();
    const match = parseVsmText(buildVsmText(session), buildVsmFileName(session)).matches[0];
    const settings = buildMatchViewerSettings(session.sets, match, 3);
    const play = match.sets[1].events.flatMap((event) => event.plays).find((entry) => typeof entry.time === "number")!;
    expect(calculateSeekSeconds(play, settings, match)).toBeCloseTo(play.time! / 10 - 3, 6);
  });
});
