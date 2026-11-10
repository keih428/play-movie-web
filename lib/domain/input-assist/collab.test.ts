import { describe, expect, it } from "vitest";
import {
  IA_STORAGE_VERSION,
  composeSession,
  emptySliceData,
  isSplitDocument,
  mergeRecords,
  mergeSliceData,
  metaFromDocument,
  migrateLegacySession,
  normalizeSliceData,
  parseSliceKey,
  replaceSlice,
  sameData,
  sliceKey,
  splitSession,
  stableStringify,
  type IaP0Data,
  type IaP1Data,
  type IaPlayFieldsData,
} from "@/lib/domain/input-assist/collab";
import { createEmptySet, emptyTeam } from "@/lib/domain/input-assist/session";
import type { IaPlay, IaRally, InputAssistSession } from "@/lib/domain/input-assist/types";

function play(id: string, extra: Partial<IaPlay> = {}): IaPlay {
  return { id, team: "*", player: 5, skill: "A", time: 10, source: "manual", ...extra };
}

function rally(id: string, serveTime: number, extra: Partial<IaRally> = {}): IaRally {
  return { id, serveTime, side: "near", status: "rally", source: "auto", ...extra };
}

function sampleSession(): InputAssistSession {
  const set1 = createEmptySet(1);
  set1.youtubeUrl = "https://youtu.be/abc";
  set1.finalScore = { home: 25, away: 20 };
  set1.rallies = [
    rally("r2", 30, {
      confidence: 0.7,
      checked: true,
      flowDone: true,
      plays: [
        play("s2", { skill: "S", source: "auto", effect: "-", effectSource: "auto", startZone: 1, startZoneSource: "manual", hitType: "Q", typeSource: { hitType: "manual" } }),
        play("a2", { team: "a", effect: "#", effectSource: "manual", endZone: 6, endSubZone: "B", endZoneSource: "auto", combination: "X5", typeSource: { combination: "auto" } }),
      ],
    }),
    rally("r1", 10, { plays: [play("s1", { skill: "S", code: "*05SM-", extra: { foo: 1 } })] }),
    rally("r3", 50, { side: null, source: "manual" }),
  ];
  set1.substitutions = [{ id: "sub1", time: 40, team: "home", playerIn: 9, playerOut: 3 }];
  set1.timeouts = [{ id: "to1", time: 45, team: "away" }];
  const set2 = createEmptySet(2, set1);
  set2.skipped = true;
  return {
    id: "0123456789abcdef01234567",
    teamSlug: "utvb",
    title: "練習試合",
    date: "2026-11-10",
    opponent: "千葉大学",
    teams: { home: emptyTeam("東大"), away: emptyTeam("千葉大") },
    extras: { gameType: "M" },
    sets: [set1, set2],
    passLogs: [
      { id: "log1", setIndex: 1, pass: "P0", startedAt: "a", endedAt: "b", seconds: 30, memberId: "m1", memberName: "林" },
    ],
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T01:00:00.000Z",
  };
}

/** 並びを serveTime 順にそろえたセッション(分けると P0 は時刻順になる)。 */
function sortedSession(session: InputAssistSession): InputAssistSession {
  return {
    ...session,
    passLogs: [],
    sets: session.sets.map((set) => ({ ...set, rallies: [...set.rallies].sort((a, b) => a.serveTime - b.serveTime) })),
  };
}

describe("スライスのキー", () => {
  it("セットとパスから作り、読み戻せる", () => {
    expect(sliceKey(3, "P2")).toBe("3-P2");
    expect(parseSliceKey("3-P2")).toEqual({ setIndex: 3, pass: "P2" });
    expect(parseSliceKey("6-P2")).toBeNull();
    expect(parseSliceKey("1-P5")).toBeNull();
  });
});

describe("splitSession・composeSession", () => {
  it("分けて組み立て直すと、同じセッションになる(passLogs はデータベースに移すので空)", () => {
    const session = sampleSession();
    const { meta, slices } = splitSession(session);
    expect(composeSession(meta, slices)).toEqual(sortedSession(session));
  });

  it("メタにはラリー・交代・タイムアウトを持たず、準備(URL・スコア・打たないセット)だけ", () => {
    const { meta } = splitSession(sampleSession());
    expect(meta.storageVersion).toBe(IA_STORAGE_VERSION);
    expect(meta).not.toHaveProperty("passLogs");
    expect(meta.sets[0]).toMatchObject({ youtubeUrl: "https://youtu.be/abc", finalScore: { home: 25, away: 20 }, rallies: [], substitutions: [], timeouts: [] });
    expect(meta.sets[1].skipped).toBe(true);
  });

  it("パスごとに、そのパスの欄だけを持つ", () => {
    const { slices } = splitSession(sampleSession());
    const p0 = slices["1-P0"] as IaP0Data;
    expect(p0.rallies.map((entry) => entry.id)).toEqual(["r1", "r2", "r3"]);
    expect(p0.rallies[1]).toEqual({ id: "r2", serveTime: 30, side: "near", status: "rally", source: "auto", confidence: 0.7, checked: true });
    expect(p0.substitutions).toHaveLength(1);
    expect(p0.timeouts).toHaveLength(1);

    const p1 = slices["1-P1"] as IaP1Data;
    expect(Object.keys(p1.rallies).sort()).toEqual(["r1", "r2"]);
    expect(p1.rallies.r2.flowDone).toBe(true);
    expect(p1.rallies.r2.plays?.[1]).toEqual({ id: "a2", team: "a", player: 5, skill: "A", time: 10, source: "manual" });
    // VSM から読み込んだ code・extra は P1 に残す
    expect(p1.rallies.r1.plays?.[0]).toMatchObject({ code: "*05SM-", extra: { foo: 1 } });

    expect((slices["1-P2"] as IaPlayFieldsData).plays).toEqual({
      s2: { effect: "-", effectSource: "auto" },
      a2: { effect: "#", effectSource: "manual" },
    });
    expect((slices["1-P3"] as IaPlayFieldsData).plays).toEqual({
      s2: { startZone: 1, startZoneSource: "manual" },
      a2: { endZone: 6, endSubZone: "B", endZoneSource: "auto" },
    });
    expect((slices["1-P4"] as IaPlayFieldsData).plays).toEqual({
      s2: { hitType: "Q", typeSource: { hitType: "manual" } },
      a2: { combination: "X5", typeSource: { combination: "auto" } },
    });
    // 打たないセットも分ける
    expect(slices["2-P0"]).toEqual(emptySliceData("P0"));
  });

  it("スライスがなければ、空のセット", () => {
    const { meta } = splitSession(sampleSession());
    const session = composeSession(meta, {});
    expect(session.sets[0].rallies).toEqual([]);
    expect(session.sets[0].substitutions).toEqual([]);
  });

  it("P0 で消したラリーの、P1〜P4 の中身は捨てる", () => {
    const { meta, slices } = splitSession(sampleSession());
    const p0 = slices["1-P0"] as IaP0Data;
    const withoutR2 = { ...slices, "1-P0": { ...p0, rallies: p0.rallies.filter((entry) => entry.id !== "r2") } };
    const session = composeSession(meta, withoutR2);
    expect(session.sets[0].rallies.map((entry) => entry.id)).toEqual(["r1", "r3"]);
    // 次に分けたとき(保存するとき)には、消えたラリーのタッチ・評価は残らない
    const again = splitSession(session).slices;
    expect(Object.keys((again["1-P1"] as IaP1Data).rallies)).toEqual(["r1"]);
    expect((again["1-P2"] as IaPlayFieldsData).plays).toEqual({});
  });

  it("P1 で消したタッチの、P2〜P4 の中身は捨てる", () => {
    const { meta, slices } = splitSession(sampleSession());
    const p1 = slices["1-P1"] as IaP1Data;
    const withoutA2: IaP1Data = {
      rallies: { ...p1.rallies, r2: { ...p1.rallies.r2, plays: p1.rallies.r2.plays?.filter((entry) => entry.id !== "a2") } },
    };
    const session = composeSession(meta, { ...slices, "1-P1": withoutA2 });
    const plays = session.sets[0].rallies.find((entry) => entry.id === "r2")?.plays ?? [];
    expect(plays.map((entry) => entry.id)).toEqual(["s2"]);
    expect(plays[0]).toMatchObject({ effect: "-", startZone: 1, hitType: "Q" });
    expect((splitSession(session).slices["1-P2"] as IaPlayFieldsData).plays).toEqual({ s2: { effect: "-", effectSource: "auto" } });
  });

  it("あとのパスのスライスが、P1 の欄を書き換えることはない", () => {
    const { meta, slices } = splitSession(sampleSession());
    const sneaky = { plays: { a2: { effect: "+", player: 99, skill: "B" } } } as unknown as IaPlayFieldsData;
    const session = composeSession(meta, { ...slices, "1-P2": sneaky });
    const a2 = session.sets[0].rallies.find((entry) => entry.id === "r2")?.plays?.find((entry) => entry.id === "a2");
    expect(a2).toMatchObject({ effect: "+", player: 5, skill: "A" });
  });

  it("メタにないセットのスライスは使わない", () => {
    const { meta, slices } = splitSession(sampleSession());
    const session = composeSession({ ...meta, sets: [meta.sets[0]] }, slices);
    expect(session.sets.map((set) => set.setIndex)).toEqual([1]);
  });

  it("replaceSlice:1つのスライスだけを差し替える", () => {
    const session = sampleSession();
    const next = replaceSlice(session, "1-P2", { plays: { a2: { effect: "/", effectSource: "manual" } } });
    const plays = next.sets[0].rallies.find((entry) => entry.id === "r2")?.plays ?? [];
    expect(plays.find((entry) => entry.id === "a2")?.effect).toBe("/");
    expect(plays.find((entry) => entry.id === "s2")?.effect).toBeUndefined();
    expect(plays.find((entry) => entry.id === "s2")?.startZone).toBe(1);
  });
});

describe("前の形(1つの文書)からの移し替え", () => {
  it("前の形の文書を分けると、中身は変わらない", () => {
    const legacy = sampleSession();
    const { meta, slices } = migrateLegacySession(legacy);
    expect(isSplitDocument(legacy)).toBe(false);
    expect(isSplitDocument(meta)).toBe(true);
    expect(composeSession(meta, slices)).toEqual(sortedSession(legacy));
  });

  it("おかしな欄があっても、整えてから分ける(打たないセットも残す)", () => {
    const legacy = sampleSession() as unknown as Record<string, unknown>;
    const sets = (legacy.sets as Array<Record<string, unknown>>).map((set) => ({ ...set }));
    sets[0].rallies = [...(sets[0].rallies as unknown[]), { id: "", serveTime: "x" }, null];
    const { meta, slices } = migrateLegacySession({ ...legacy, sets } as unknown as InputAssistSession);
    expect((slices["1-P0"] as IaP0Data).rallies.map((entry) => entry.id)).toEqual(["r1", "r2", "r3"]);
    expect(meta.sets[1].skipped).toBe(true);
  });

  it("metaFromDocument:前の形でも新しい形でも、準備だけのメタになる", () => {
    const legacy = sampleSession();
    const fromLegacy = metaFromDocument(legacy);
    expect(fromLegacy.sets[0].rallies).toEqual([]);
    expect(fromLegacy.storageVersion).toBe(IA_STORAGE_VERSION);
    expect(metaFromDocument(fromLegacy)).toEqual(fromLegacy);
  });
});

describe("normalizeSliceData(API で受け取ったスライス)", () => {
  it("P0:ラリーを整え、plays・flowDone は落とす", () => {
    const data = normalizeSliceData("P0", {
      rallies: [{ id: "r1", serveTime: 12.345, side: "far", status: "rally", source: "manual", plays: [play("x")], flowDone: true }],
      substitutions: [],
      timeouts: [{ id: "t", time: 3, team: "away" }],
    }) as IaP0Data;
    expect(data.rallies).toEqual([{ id: "r1", serveTime: 12.3, side: "far", status: "rally", source: "manual" }]);
    expect(data.timeouts).toEqual([{ id: "t", time: 3, team: "away" }]);
  });

  it("P1:タッチを整え、あとのパスの欄は落とす", () => {
    const data = normalizeSliceData("P1", {
      rallies: { r1: { flowDone: true, plays: [play("p1", { effect: "#", startZone: 3 }), { id: "bad" }] } },
    }) as IaP1Data;
    expect(data.rallies.r1).toEqual({ flowDone: true, plays: [play("p1")] });
  });

  it("P2〜P4:そのパスの欄だけを残す", () => {
    const data = normalizeSliceData("P3", {
      plays: { p1: { startZone: 4, startSubZone: "C", effect: "#", startZoneSource: "manual" }, p2: { effect: "+" } },
    }) as IaPlayFieldsData;
    expect(data.plays).toEqual({ p1: { startZone: 4, startSubZone: "C", startZoneSource: "manual" } });
  });

  it("読めないものは null", () => {
    expect(normalizeSliceData("P0", null)).toBeNull();
    expect(normalizeSliceData("P2", [])).toBeNull();
  });
});

describe("ぶつかったときに合わせる(3方向)", () => {
  it("mergeRecords:片方だけが変えたものはその変更、両方が変えたものは prefer の方", () => {
    const base = { a: 1, b: 2, c: 3, d: 4 };
    const mine = { a: 10, b: 2, c: 30, d: 4, e: 5 };
    const theirs = { a: 1, b: 20, c: 300, f: 6 };
    expect(mergeRecords(base, mine, theirs, "mine")).toEqual({ a: 10, b: 20, c: 30, e: 5, f: 6 });
    expect(mergeRecords(base, mine, theirs, "theirs")).toEqual({ a: 10, b: 20, c: 300, e: 5, f: 6 });
  });

  it("P0:ラリーごと。片方が足したラリー・もう片方が向きを決めたラリーは両方残る", () => {
    const base: IaP0Data = { rallies: [rally("r1", 10), rally("r2", 20, { side: null })], substitutions: [], timeouts: [] };
    const mine: IaP0Data = { ...base, rallies: [rally("r1", 10), rally("r2", 20, { side: "far" })] };
    const theirs: IaP0Data = {
      ...base,
      rallies: [rally("r1", 10), rally("r2", 20, { side: null }), rally("r0", 5)],
      timeouts: [{ id: "t1", time: 7, team: "home" }],
    };
    const merged = mergeSliceData("P0", base, mine, theirs, "mine") as IaP0Data;
    expect(merged.rallies.map((entry) => [entry.id, entry.side])).toEqual([
      ["r0", "near"],
      ["r1", "near"],
      ["r2", "far"],
    ]);
    expect(merged.timeouts).toHaveLength(1);
  });

  it("P0:相手が消したラリーは、こちらが変えていなければ消える", () => {
    const base: IaP0Data = { rallies: [rally("r1", 10), rally("r2", 20)], substitutions: [], timeouts: [] };
    const theirs: IaP0Data = { ...base, rallies: [rally("r1", 10)] };
    expect((mergeSliceData("P0", base, base, theirs, "mine") as IaP0Data).rallies.map((entry) => entry.id)).toEqual(["r1"]);
  });

  it("P1:ラリーごと。同じラリーを両方が変えたら prefer の方", () => {
    const base: IaP1Data = { rallies: { r1: { plays: [play("a")] }, r2: { plays: [play("b")] } } };
    const mine: IaP1Data = { rallies: { r1: { plays: [play("a"), play("c")] }, r2: { plays: [play("b", { player: 7 })] } } };
    const theirs: IaP1Data = { rallies: { r1: { plays: [play("a")] }, r2: { plays: [play("b", { player: 8 })] }, r3: { flowDone: true } } };
    const preferMine = mergeSliceData("P1", base, mine, theirs, "mine") as IaP1Data;
    expect(preferMine.rallies.r1.plays).toHaveLength(2);
    expect(preferMine.rallies.r2.plays?.[0].player).toBe(7);
    expect(preferMine.rallies.r3).toEqual({ flowDone: true });
    const preferTheirs = mergeSliceData("P1", base, mine, theirs, "theirs") as IaP1Data;
    expect(preferTheirs.rallies.r2.plays?.[0].player).toBe(8);
  });

  it("P2〜P4:タッチごと", () => {
    const base: IaPlayFieldsData = { plays: { a: { effect: "#" } } };
    const mine: IaPlayFieldsData = { plays: { a: { effect: "#" }, b: { effect: "+" } } };
    const theirs: IaPlayFieldsData = { plays: { a: { effect: "=" } } };
    expect(mergeSliceData("P2", base, mine, theirs, "mine")).toEqual({ plays: { a: { effect: "=" }, b: { effect: "+" } } });
  });

  it("まだサーバーにないスライス(base なし)でも合わせられる", () => {
    const mine: IaPlayFieldsData = { plays: { a: { effect: "#" } } };
    const theirs: IaPlayFieldsData = { plays: { b: { effect: "+" } } };
    expect(mergeSliceData("P2", undefined, mine, theirs, "mine")).toEqual({ plays: { a: { effect: "#" }, b: { effect: "+" } } });
  });
});

describe("stableStringify", () => {
  it("キーの並びと undefined の欄によらない", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(stableStringify({ a: [1, { d: 2 }], b: 1 }));
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
  });
});
