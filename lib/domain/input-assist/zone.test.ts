import { describe, expect, it } from "vitest";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import type { IaPlay, IaSet, IaSkill, IaTeamCode } from "@/lib/domain/input-assist/types";
import {
  applyBallPosition,
  applyZoneChain,
  applyZoneChainToSet,
  buildZoneQueue,
  combinationStart,
  isZoneStepDone,
  isZoneStepNeeded,
  locateOnDiagram,
  nextZoneStep,
  parseZoneKeys,
  serveZoneAt,
  toDiagram,
  zoneAt,
  zoneCenter,
  zoneProgress,
  zoneRallies,
  type ZoneQueueItem,
} from "@/lib/domain/input-assist/zone";

function plays(...entries: string[]): IaPlay[] {
  // "*5S" "a11R" のように、チーム(* か a)・背番号・スキル。"/PV" を後ろに付けると攻撃コンビ。P1 で入れたタッチ(source manual)
  return entries.map((entry, index) => {
    const match = /^([*a])(\d+)([SREABDF])(?:\/(\w+))?$/.exec(entry);
    if (!match) {
      throw new Error(entry);
    }
    const play: IaPlay = {
      id: `p${index}`,
      team: match[1] as IaTeamCode,
      player: Number(match[2]),
      skill: match[3] as IaSkill,
      source: index === 0 ? "auto" : "manual",
    };
    if (match[4]) {
      play.combination = match[4];
    }
    return play;
  });
}

function zones(list: IaPlay[]): string[] {
  return list.map((play) => `${play.startZone ?? ""}${play.startSubZone ?? ""}>${play.endZone ?? ""}${play.endSubZone ?? ""}`);
}

describe("P3:コートの位置 → ゾーン・サブゾーン", () => {
  it("ネットが上:前 4 3 2・中 7 8 9・後ろ 5 6 1(そのコートのチームから見て左から)", () => {
    expect(zoneAt({ x: 0.1, y: 0.1 }).zone).toBe(4);
    expect(zoneAt({ x: 0.5, y: 0.1 }).zone).toBe(3);
    expect(zoneAt({ x: 0.9, y: 0.1 }).zone).toBe(2);
    expect(zoneAt({ x: 0.1, y: 0.5 }).zone).toBe(7);
    expect(zoneAt({ x: 0.5, y: 0.5 }).zone).toBe(8);
    expect(zoneAt({ x: 0.9, y: 0.5 }).zone).toBe(9);
    expect(zoneAt({ x: 0.1, y: 0.9 }).zone).toBe(5);
    expect(zoneAt({ x: 0.5, y: 0.9 }).zone).toBe(6);
    expect(zoneAt({ x: 0.9, y: 0.9 }).zone).toBe(1);
  });

  it("サブゾーン:ネット側の左が C・右が B、エンドライン側の左が D・右が A", () => {
    // ゾーン4(左前)を4つに
    expect(zoneAt({ x: 0.05, y: 0.05 })).toEqual({ zone: 4, subZone: "C" });
    expect(zoneAt({ x: 0.3, y: 0.05 })).toEqual({ zone: 4, subZone: "B" });
    expect(zoneAt({ x: 0.05, y: 0.3 })).toEqual({ zone: 4, subZone: "D" });
    expect(zoneAt({ x: 0.3, y: 0.3 })).toEqual({ zone: 4, subZone: "A" });
    // ゾーン1(右後ろ)
    expect(zoneAt({ x: 0.7, y: 0.7 })).toEqual({ zone: 1, subZone: "C" });
    expect(zoneAt({ x: 0.95, y: 0.95 })).toEqual({ zone: 1, subZone: "A" });
  });

  it("コートの外は、いちばん近いゾーン", () => {
    expect(zoneAt({ x: -0.2, y: -0.1 })).toEqual({ zone: 4, subZone: "C" });
    expect(zoneAt({ x: 1.3, y: 1.4 })).toEqual({ zone: 1, subZone: "A" });
  });

  it("ゾーンの真ん中から、同じゾーンに戻る", () => {
    for (const zone of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      for (const subZone of ["A", "B", "C", "D"] as const) {
        const center = zoneCenter(zone, subZone);
        expect(center && zoneAt(center)).toEqual({ zone, subZone });
      }
    }
    expect(zoneCenter(10)).toBeNull();
  });

  it("サーブの始まり:エンドラインの後ろ、左から 5・7・6・9・1", () => {
    expect([0.05, 0.3, 0.5, 0.7, 0.95].map(serveZoneAt)).toEqual([5, 7, 6, 9, 1]);
  });

  it("図の位置:手前のコートは下でそのまま、奥のコートは上下も左右も逆", () => {
    // 手前の左前(ネットのすぐ下の左)= 手前のチームのゾーン4
    const nearFront = locateOnDiagram({ u: 0.1, v: 0.55 });
    expect(nearFront).toMatchObject({ side: "near", behindEndLine: false });
    expect(zoneAt(nearFront).zone).toBe(4);
    // 奥のネットのすぐ上の、図の左 = 奥のチームから見ると右 → ゾーン2
    const farFront = locateOnDiagram({ u: 0.1, v: 0.45 });
    expect(farFront.side).toBe("far");
    expect(zoneAt(farFront)).toEqual({ zone: 2, subZone: "B" });
    // 図の右下 = 手前のチームの右後ろ(ゾーン1)、図の左上 = 奥のチームの右後ろ(ゾーン1)
    expect(zoneAt(locateOnDiagram({ u: 0.9, v: 0.95 })).zone).toBe(1);
    expect(zoneAt(locateOnDiagram({ u: 0.1, v: 0.05 })).zone).toBe(1);
    // エンドラインの後ろ
    expect(locateOnDiagram({ u: 0.5, v: 1.05 }).behindEndLine).toBe(true);
    expect(locateOnDiagram({ u: 0.5, v: -0.05 })).toMatchObject({ side: "far", behindEndLine: true });
    // 行き来
    const back = toDiagram("far", { x: 0.2, y: 0.7 });
    expect(locateOnDiagram(back)).toMatchObject({ side: "far", x: expect.closeTo(0.2), y: expect.closeTo(0.7) });
  });

  it("キー:1〜9 と a〜d", () => {
    expect(parseZoneKeys("5")).toEqual({ zone: 5 });
    expect(parseZoneKeys("4c")).toEqual({ zone: 4, subZone: "C" });
    expect(parseZoneKeys("2B")).toEqual({ zone: 2, subZone: "B" });
    expect(parseZoneKeys("0")).toBeNull();
    expect(parseZoneKeys("4e")).toBeNull();
    expect(parseZoneKeys("")).toBeNull();
  });
});

describe("P3:攻撃コンビからアタックの始まり", () => {
  it("田中の一覧の始まり(PV 4C・P1 4C・PZ 2B・PA 3C・P2 4・P3 3・PB 3・P5 2B・P9 9・P8 8)", () => {
    expect(combinationStart("PV")).toEqual({ zone: 4, subZone: "C" });
    expect(combinationStart("P1")).toEqual({ zone: 4, subZone: "C" });
    expect(combinationStart("P2")).toEqual({ zone: 4 });
    expect(combinationStart("PA")).toEqual({ zone: 3, subZone: "C" });
    expect(combinationStart("P3")).toEqual({ zone: 3 });
    expect(combinationStart("PB")).toEqual({ zone: 3 });
    expect(combinationStart("P5")).toEqual({ zone: 2, subZone: "B" });
    expect(combinationStart("PZ")).toEqual({ zone: 2, subZone: "B" });
    expect(combinationStart("P9")).toEqual({ zone: 9 });
    expect(combinationStart("P8")).toEqual({ zone: 8 });
    expect(combinationStart("XX")).toBeNull();
    expect(combinationStart(undefined)).toBeNull();
  });

  it("アタックの始まりを攻撃コンビから入れ、トスの終わりにも写す(自動)", () => {
    const rally = applyZoneChain(plays("*5S", "a11R", "a13E", "a8A/PV"));
    expect(zones(rally)).toEqual([">", ">", ">4C", "4C>"]);
    expect(rally[3].startZoneSource).toBe("auto");
    expect(rally[2].endZoneSource).toBe("auto");
    // 変わらなければ同じ配列
    expect(applyZoneChain(rally)).toBe(rally);
  });
});

describe("P3:1タッチ1クリック", () => {
  it("押した位置が、前のタッチの終わりと今のタッチの始まりになる。最後は落ちた場所", () => {
    let rally = plays("*5S", "a11R", "a13E", "a8A", "*7D");
    rally = applyBallPosition(rally, 0, { zone: 1, subZone: "A" });
    // サーブの始まりにサブゾーンは付けない
    expect(zones(rally)[0]).toBe("1>");
    rally = applyBallPosition(rally, 1, { zone: 5, subZone: "B" });
    rally = applyBallPosition(rally, 2, { zone: 3, subZone: "C" });
    rally = applyBallPosition(rally, 3, { zone: 4, subZone: "C" });
    rally = applyBallPosition(rally, 4, { zone: 1, subZone: "D" });
    rally = applyBallPosition(rally, 5, { zone: 6, subZone: "A" });
    expect(zones(rally)).toEqual(["1>5B", "5B>3C", "3C>4C", "4C>1D", "1D>6A"]);
    expect(rally.every((play) => play.startZoneSource === "manual" && play.endZoneSource === "manual")).toBe(true);
  });

  it("ブロックの終わりはつながない(ブロックのあとのディグは始まりだけ)", () => {
    let rally = plays("*5S", "a11R", "a13E", "a8A", "*14B", "a11D");
    rally = applyBallPosition(rally, 4, { zone: 2, subZone: "B" });
    rally = applyBallPosition(rally, 5, { zone: 8, subZone: "A" });
    expect(zones(rally).slice(3)).toEqual([">2B", "2B>", "8A>"]);
  });

  it("片方だけ分かっていれば、自動でつなぐ。人が押したら上書きし、自動の値は入れ直す", () => {
    let rally = plays("*5S", "a11R", "a13E", "a8A/PZ", "*7D");
    rally = applyZoneChain(rally);
    expect(zones(rally)).toEqual([">", ">", ">2B", "2B>", ">"]);
    // 人がアタックの位置を押す(コンビと違う)→ トスの終わりも人の値
    rally = applyBallPosition(rally, 3, { zone: 3, subZone: "B" });
    expect(zones(rally)).toEqual([">", ">", ">3B", "3B>", ">"]);
    expect(rally[3].startZoneSource).toBe("manual");
    // 消すと、コンビから自動で入れ直す
    rally = applyBallPosition(rally, 3, null);
    expect(zones(rally)).toEqual([">", ">", ">2B", "2B>", ">"]);
    expect(rally[3].startZoneSource).toBe("auto");
  });

  it("読み込んだタッチ(source なし)のゾーンは変えず、足しもしない", () => {
    const loaded: IaPlay[] = [
      { id: "x1", team: "*", player: 5, skill: "S", startZone: 1, endZone: 6, endSubZone: "A", code: "5SM16A." },
      { id: "x2", team: "a", player: 11, skill: "R" },
      { id: "x3", team: "a", player: 13, skill: "E" },
      { id: "x4", team: "a", player: 8, skill: "A", combination: "PV" },
    ];
    expect(applyZoneChain(loaded)).toBe(loaded);
  });

  it("code に入るゾーンが変わったら、読み込んだ code を捨てる(書き出すときに作り直す)", () => {
    const loaded: IaPlay[] = [
      { id: "x1", team: "*", player: 5, skill: "S", startZone: 1, endZone: 6, endSubZone: "A", code: "5SM16A." },
      { id: "x2", team: "a", player: 11, skill: "R", startZone: 6, startSubZone: "A", code: ".11#" },
    ];
    const next = applyBallPosition(loaded, 1, { zone: 5, subZone: "B" });
    expect(next[0]).not.toHaveProperty("code");
    expect(next[0]).toMatchObject({ endZone: 5, endSubZone: "B", startZone: 1 });
    // R の code にゾーンは入らないので残す
    expect(next[1].code).toBe(".11#");
  });
});

describe("P3:田中の書き方で、押すステップを絞る", () => {
  it("要るステップ:S・R・A・B の始まり、S・R・E・A・F の終わりにつながるもの。最後の落ちた場所", () => {
    const rally = plays("*5S", "a11R", "a13E", "a8A", "*14B", "a11D", "a13E", "a8F", "*7D");
    expect(rally.map((_, step) => isZoneStepNeeded(rally, step))).toEqual([
      true, // S の始まり
      true, // S の終わり・R の始まり
      true, // R の終わり
      true, // E の終わり・A の始まり
      true, // A の終わり・B の始まり
      false, // B のあとのディグ(B の終わり・D の始まりは入れない)
      false, // D の終わり・E の始まり
      true, // E の終わり
      true, // F の終わり
    ]);
    // 落ちた場所:最後が D なら要らない、A なら要る
    expect(isZoneStepNeeded(rally, rally.length)).toBe(false);
    const attack = plays("*5S", "a11R", "a13E", "a8A");
    expect(isZoneStepNeeded(attack, attack.length)).toBe(true);
  });

  it("並び・次のステップ・進み具合", () => {
    const set: IaSet = {
      ...createEmptySet(1),
      startingLineup: {
        home: { positions: { "1": 5, "2": 12, "3": 14, "4": 24, "5": 29, "6": 7 }, setterAt: 5 },
        away: { positions: { "1": 13, "2": 3, "3": 9, "4": 8, "5": 5, "6": 11 }, setterAt: 1 },
      },
      finalScore: { home: 0, away: 2 },
      rallies: [
        {
          id: "a".repeat(24),
          serveTime: 10,
          side: "near",
          status: "rally",
          source: "auto",
          flowDone: true,
          plays: plays("*5S", "a11R", "a13E", "a8A/PV").slice(1),
        },
        { id: "b".repeat(24), serveTime: 30, side: "far", status: "rally", source: "auto", flowDone: true },
        // P1 を入れていないラリーは数えない
        { id: "c".repeat(24), serveTime: 50, side: "far", status: "rally", source: "auto" },
      ],
    };
    const entries = zoneRallies(set);
    expect(entries.map((entry) => entry.plays.map((play) => play.skill).join(""))).toEqual(["SREA", "S"]);
    const queue = buildZoneQueue(entries, "needed");
    // 1本目:S・R・E・A・落ちた場所(5)、2本目:S・落ちた場所(2)
    expect(queue.map((item) => `${item.rallyId[0]}${item.step}`)).toEqual(["a0", "a1", "a2", "a3", "a4", "b0", "b1"]);
    const byId = new Map(entries.map((entry) => [entry.rally.id, entry]));
    const isDone = (item: ZoneQueueItem) => isZoneStepDone(byId.get(item.rallyId)!.plays, item.step);
    // A の始まりはコンビから決まっているので、飛ばす
    expect(nextZoneStep(queue, isDone, queue[2])).toEqual({ rallyId: "a".repeat(24), step: 4 });
    expect(nextZoneStep(queue, isDone, null)).toEqual({ rallyId: "a".repeat(24), step: 0 });
    expect(zoneProgress([set])).toEqual([{ setIndex: 1, done: 1, needed: 7, rallies: 2 }]);

    // 開いたときに自動のゾーンを保存する(サーブも先頭に入る)
    const applied = applyZoneChainToSet(set);
    expect(applied).not.toBe(set);
    expect(applied.rallies[0].plays?.map((play) => play.skill).join("")).toBe("SREA");
    expect(applyZoneChainToSet(applied)).toBe(applied);
    expect(applyZoneChainToSet({ ...set, skipped: true })).toEqual({ ...set, skipped: true });
  });
});
