import { describe, expect, it } from "vitest";
import {
  aiJobSetStates,
  buildAiJobSets,
  decideSetApply,
  describeAiJob,
  describeAiSetStates,
  mergeSkeletonSets,
  formatClockInput,
  hasSkeletonApplied,
  parseClockInput,
  planSkeletonApply,
  skeletonRalliesForSet,
  skeletonRallyId,
} from "@/lib/domain/input-assist/ai-job";
import { addMissingPlayers } from "@/lib/domain/input-assist/roster";
import { createEmptySet, emptyTeam } from "@/lib/domain/input-assist/session";
import type { IaSet, IaSkeleton } from "@/lib/domain/input-assist/types";

function set(setIndex: number, patch: Partial<IaSet> = {}): IaSet {
  return {
    ...createEmptySet(setIndex),
    youtubeUrl: "https://youtu.be/A",
    finalScore: { home: 25, away: 20 },
    ...patch,
  };
}

const JOB = "6930a1b2c3d4e5f601234567";

describe("打ち込み補助:AI に頼む依頼の中身", () => {
  it("開始時刻と、同じ動画の次のセットの開始を終わりにする。別の動画・開始時刻なしなら終わりは null", () => {
    const built = buildAiJobSets([
      set(1, { startTime: 30 }),
      set(2, { startTime: 1458 }),
      set(3, { youtubeUrl: "https://youtu.be/B", nearTeam: "away" }),
      set(4, { youtubeUrl: "https://youtu.be/B", finalScore: { home: 23, away: 25 } }),
    ]);
    expect(built.error).toBeUndefined();
    expect(built.sets).toEqual([
      { setIndex: 1, youtubeUrl: "https://youtu.be/A", startSec: 30, endSec: 1458, finalScore: { home: 25, away: 20 }, nearTeam: "home", refereeHint: null },
      { setIndex: 2, youtubeUrl: "https://youtu.be/A", startSec: 1458, endSec: null, finalScore: { home: 25, away: 20 }, nearTeam: "home", refereeHint: null },
      { setIndex: 3, youtubeUrl: "https://youtu.be/B", startSec: 0, endSec: null, finalScore: { home: 25, away: 20 }, nearTeam: "away", refereeHint: null },
      { setIndex: 4, youtubeUrl: "https://youtu.be/B", startSec: 0, endSec: null, finalScore: { home: 23, away: 25 }, nearTeam: "home", refereeHint: null },
    ]);
  });

  it("打たないセットは外す(終わりの時刻には使う)。打つセットに URL か最終スコアがなければ頼めない", () => {
    const built = buildAiJobSets([
      set(1, { skipped: true, youtubeUrl: "", finalScore: { home: null, away: null } }),
      set(2, { startTime: 10 }),
      set(3, { startTime: 900, skipped: true }),
    ]);
    expect(built.sets?.map((entry) => [entry.setIndex, entry.endSec])).toEqual([[2, 900]]);

    expect(buildAiJobSets([set(1), set(2, { youtubeUrl: " " })]).error).toContain("2セット目");
    expect(buildAiJobSets([set(1, { finalScore: { home: 25, away: null } })]).error).toContain("1セット目");
    expect(buildAiJobSets([set(1, { skipped: true })]).error).toBeDefined();
  });
});

describe("打ち込み補助:骨組みを入れる決まり", () => {
  const skeleton: IaSkeleton = {
    version: 1,
    rallies: [
      { set: 1, serveTime: 50.04, side: "near", pSide: 0.9 },
      { set: 1, serveTime: 20, side: "far" },
      { set: 2, serveTime: 1500, side: null },
      { set: 3, serveTime: 3000, side: "near" },
      { set: 5, serveTime: 4000, side: "near" },
    ],
  };

  it("ラリーが空のセットには自動で入れ、入っているセットは聞く。試合にない・打たないセットには入れない", () => {
    expect(
      planSkeletonApply(skeleton, [
        { setIndex: 1, rallyCount: 0 },
        { setIndex: 2, rallyCount: 12 },
        { setIndex: 3, rallyCount: 0, skipped: true },
      ]),
    ).toEqual({ apply: [1], ask: [2], ignored: [3, 5] });
  });

  it("ラリーは時刻の順、id は依頼・セット・順から決まる 24 桁(何度入れても同じ)。出どころは auto", () => {
    const rallies = skeletonRalliesForSet(skeleton, 1, JOB);
    expect(rallies.map((rally) => rally.serveTime)).toEqual([20, 50]);
    expect(rallies[0]).toMatchObject({ side: "far", status: "rally", source: "auto" });
    expect(rallies[1].confidence).toBe(0.9);
    expect(rallies[0].id).toMatch(/^[0-9a-f]{24}$/);
    expect(skeletonRalliesForSet(skeleton, 1, JOB).map((rally) => rally.id)).toEqual(rallies.map((rally) => rally.id));
    expect(new Set([...rallies, ...skeletonRalliesForSet(skeleton, 2, JOB)].map((rally) => rally.id)).size).toBe(3);
    expect(skeletonRallyId(JOB, 1, 0)).not.toBe(skeletonRallyId("6930a1b2c3d4e5f601234568", 1, 0));
    expect(hasSkeletonApplied(rallies, JOB, 1)).toBe(true);
    expect(hasSkeletonApplied(rallies, JOB, 2)).toBe(false);
  });
});

describe("打ち込み補助:セットごとの途中の結果", () => {
  const part1: IaSkeleton = { version: 1, rallies: [{ set: 1, serveTime: 30, side: "near" }, { set: 1, serveTime: 10, side: "far" }] };
  const part1b: IaSkeleton = { version: 1, rallies: [{ set: 1, serveTime: 11, side: "far" }] };
  const part2: IaSkeleton = { version: 1, rallies: [{ set: 2, serveTime: 1500, side: "near" }] };

  it("届いたセットは入れ替え、ほかのセットは残す(セット・時刻の順)", () => {
    const merged = mergeSkeletonSets(mergeSkeletonSets(null, part1), part2);
    expect(merged.rallies.map((rally) => [rally.set, rally.serveTime])).toEqual([[1, 10], [1, 30], [2, 1500]]);
    const replaced = mergeSkeletonSets(merged, part1b);
    expect(replaced.rallies.map((rally) => [rally.set, rally.serveTime])).toEqual([[1, 11], [2, 1500]]);
  });

  it("同じ中身を入れてあれば二度は入れない。人の手が入っていない AI のラリーは入れ替える。人のラリーは聞く", () => {
    const first = skeletonRalliesForSet(part1, 1, JOB);
    const second = skeletonRalliesForSet(part1b, 1, JOB);
    // キーの順が違っても同じ中身
    const stored = first.map((rally) => Object.fromEntries(Object.entries(rally).reverse()));
    expect(decideSetApply({ next: first, previous: first, previousOutcome: "applied", current: [], laterPassesEmpty: true })).toBe("skip");
    expect(decideSetApply({ next: first, previous: null, previousOutcome: null, current: stored, laterPassesEmpty: true })).toBe("skip");
    expect(decideSetApply({ next: first, previous: null, previousOutcome: null, current: [], laterPassesEmpty: true })).toBe("apply");
    expect(decideSetApply({ next: second, previous: first, previousOutcome: "applied", current: stored, laterPassesEmpty: true })).toBe("apply");
    // P1〜P4 に入れたものがあれば、入れ替えない
    expect(decideSetApply({ next: second, previous: first, previousOutcome: "applied", current: stored, laterPassesEmpty: false })).toBe("ask");
    // 人が時刻を動かしていれば、入れ替えない
    const moved = [{ ...first[0], serveTime: 9 }, first[1]];
    expect(decideSetApply({ next: second, previous: first, previousOutcome: "applied", current: moved, laterPassesEmpty: true })).toBe("ask");
    expect(decideSetApply({ next: first, previous: first, previousOutcome: "waiting", current: [{ id: "manual" }], laterPassesEmpty: true })).toBe("ask");
  });

  it("セットごとの状態:届いたセットは 入れた/入れ替え待ち/できた、届いていない最初のセットが 解析中、残りは 待ち", () => {
    const sets = [1, 2, 3].map((setIndex) => ({ setIndex }) as never);
    const skeleton = mergeSkeletonSets(part1, part2);
    expect(aiJobSetStates({ status: "pending", sets, skeleton: null, applied: null }).map((entry) => entry.state)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
    const running = aiJobSetStates({ status: "running", sets, skeleton, applied: { applied: [1], waiting: [] } });
    expect(running).toEqual([
      { setIndex: 1, state: "applied", rallyCount: 2 },
      { setIndex: 2, state: "done", rallyCount: 1 },
      { setIndex: 3, state: "running", rallyCount: null },
    ]);
    expect(describeAiSetStates(running.slice(1))).toBe("2セット目 できた・3セット目 解析中");
    expect(
      aiJobSetStates({ status: "failed", sets, skeleton: part1, applied: { applied: [], waiting: [1] } }).map((entry) => entry.state),
    ).toEqual(["waiting", "failed", "failed"]);
    expect(
      describeAiSetStates([
        { setIndex: 1, state: "applied" },
        { setIndex: 2, state: "applied" },
        { setIndex: 3, state: "running" },
        { setIndex: 4, state: "pending" },
      ]),
    ).toBe("1・2セット目 入れた・3セット目 解析中");
  });
});

describe("打ち込み補助:時刻の入力・状態の表示・部内の名簿", () => {
  it("「分:秒」「時:分:秒」・秒を読む", () => {
    expect(parseClockInput("24:18")).toBe(1458);
    expect(parseClockInput("1:02:03")).toBe(3723);
    expect(parseClockInput("754")).toBe(754);
    expect(parseClockInput("")).toBeNull();
    expect(parseClockInput("12:xx")).toBeNull();
    expect(formatClockInput(1458)).toBe("24:18");
    expect(formatClockInput(3723)).toBe("1:02:03");
    expect(formatClockInput(null)).toBe("");
  });

  it("状態は 待ち / 解析中 xx% メッセージ / できた / 失敗:理由", () => {
    expect(describeAiJob({ status: "pending", progressPercent: null, progressMessage: null, error: null })).toBe("待ち");
    expect(describeAiJob({ status: "running", progressPercent: 45.4, progressMessage: "サーブを探しています", error: null })).toBe(
      "解析中 45% サーブを探しています",
    );
    expect(describeAiJob({ status: "done", progressPercent: 100, progressMessage: null, error: null })).toBe("できた");
    expect(describeAiJob({ status: "failed", progressPercent: null, progressMessage: null, error: "URL が読めない" })).toBe(
      "失敗:URL が読めない",
    );
  });

  it("部内の名簿から、ホームにいない背番号だけを足す(いる選手は書き換えない)", () => {
    const home = { ...emptyTeam("東京大学"), players: [{ shirtNumber: 1, lastName: "田中", _id: "x" }] };
    const result = addMissingPlayers(home, [
      { shirtNumber: 12, lastName: "林" },
      { shirtNumber: 1, lastName: "別人" },
      { shirtNumber: 3, lastName: "佐藤", firstName: "一郎" },
    ]);
    expect(result.added).toEqual([3, 12]);
    expect(result.team.players.map((player) => [player.shirtNumber, player.lastName])).toEqual([
      [1, "田中"],
      [3, "佐藤"],
      [12, "林"],
    ]);
    expect(result.team.players[0]._id).toBe("x");
    expect(addMissingPlayers(result.team, [{ shirtNumber: 3 }]).added).toEqual([]);
  });
});
