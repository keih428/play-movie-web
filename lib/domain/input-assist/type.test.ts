import { describe, expect, it } from "vitest";
import { editFlowPlay } from "@/lib/domain/input-assist/flow";
import { createEmptySet, normalizeSet } from "@/lib/domain/input-assist/session";
import {
  applyAutoTypes,
  applyAutoTypesToSet,
  applyTypesAndZones,
  attackerRole,
  buildTypeHistory,
  buildTypeQueue,
  combinationLabel,
  typeReviewOrder,
  emptyTypeHistory,
  fieldsToReview,
  isTypeDecided,
  readTypeValue,
  setPlayType,
  suggestTypes,
  typeProgress,
  typeRallies,
  typeValueLabel,
} from "@/lib/domain/input-assist/type";
import { TYPE_PRIOR } from "@/lib/domain/input-assist/type-prior";
import type { IaLineup, IaPlay, IaSet, IaSkill, IaTeamCode, IaTeamSide } from "@/lib/domain/input-assist/types";

function plays(...entries: string[]): IaPlay[] {
  // "*5S" "a11R#" のように、チーム(* か a)・背番号・スキル・(評価)。P1 で人が入れたタッチ(source manual)
  return entries.map((entry, index) => {
    const match = /^([*a])(\d+)([SREABDF])([#+!\-/=])?$/.exec(entry);
    if (!match) {
      throw new Error(entry);
    }
    const play: IaPlay = {
      id: `p${index}`,
      team: match[1] as IaTeamCode,
      player: Number(match[2]),
      skill: match[3] as IaSkill,
      source: index === 0 && match[3] === "S" ? "auto" : "manual",
    };
    if (match[4]) {
      play.effect = match[4];
    }
    return play;
  });
}

const LINEUP: Record<IaTeamSide, IaLineup> = {
  home: { positions: { "1": 5, "2": 12, "3": 14, "4": 24, "5": 29, "6": 7 }, setterAt: 5 },
  away: { positions: { "1": 13, "2": 3, "3": 9, "4": 8, "5": 5, "6": 11 }, setterAt: 1 },
};

function setType(list: IaPlay[], index: number, field: Parameters<typeof setPlayType>[1], value: string | null): IaPlay[] {
  return list.map((play, position) => (position === index ? setPlayType(play, field, value) : play));
}

describe("P4:田中のデータの表", () => {
  it("写せる欄の当たり方と、表の出どころ", () => {
    expect(TYPE_PRIOR.matches).toBe(44);
    expect(TYPE_PRIOR.copy["R<S"]).toBeGreaterThan(0.99);
    expect(TYPE_PRIOR.copy["E<A"]).toBeGreaterThan(0.95);
    expect(TYPE_PRIOR.copy["target<combo"]).toBeGreaterThan(0.99);
    expect(TYPE_PRIOR.serve.p.M).toBeCloseTo(0.626);
    // R が # なら、コールは KA が多い。R が - ならコールなし
    expect(TYPE_PRIOR.call_by_prev["R|#"].p.KA).toBeGreaterThan(0.7);
    expect(TYPE_PRIOR.call_by_prev["R|-"].p[""]).toBeGreaterThan(0.95);
  });

  it("アタッカーの前衛・後衛とセッターからの位置", () => {
    expect(attackerRole(LINEUP.away, 8)).toEqual({ row: "front", offset: "3" });
    expect(attackerRole(LINEUP.home, 24)).toEqual({ row: "front", offset: "5" });
    expect(attackerRole(LINEUP.home, 7)).toEqual({ row: "back", offset: "1" });
    expect(attackerRole(LINEUP.home, 99)).toEqual({ row: "L", offset: "L" });
    expect(attackerRole(createEmptySet(1).startingLineup.home, 5)).toBeNull();
  });

  it("コンビ・コールの短い名前", () => {
    expect(combinationLabel("PV")).toBe("レフト平行");
    expect(combinationLabel("KA")).toBe("Aクイック");
    expect(combinationLabel("PK")).toBe("Right Oneleg");
    expect(combinationLabel("")).toBe("なし");
    expect(typeValueLabel("S", "hitType", "Q")).toBe("ジャンプサーブ");
    expect(typeValueLabel("A", "players", "2")).toBe("2人");
  });
});

describe("P4:欄の候補", () => {
  it("サーブの種類:はじめは全体の割合(M が 6 割)で、迷う", () => {
    const [serve] = suggestTypes(plays("*5S", "a11R"), { lineup: LINEUP });
    expect(serve.hitType).toMatchObject({ top: "M", isConfident: false });
    expect(serve.hitType?.probability).toBeCloseTo(0.626);
  });

  it("サーブの種類:同じ選手のこれまでのサーブから(7本続けて Q なら自動)", () => {
    const history = emptyTypeHistory();
    history.serve.set("*|5", new Map([["Q", 7]]));
    history.serveTeam.set("*", new Map([["Q", 7]]));
    const [serve] = suggestTypes(plays("*5S", "a11R"), { history });
    expect(serve.hitType).toMatchObject({ top: "Q", isConfident: true });
    // ほかの選手は、チームのこれまでに寄るが、自動では入れない
    const [other] = suggestTypes(plays("*7S", "a11R"), { history });
    expect(other.hitType?.isConfident).toBe(false);
  });

  it("R の種類はサーブの種類を写す。E の種類・トスの先は次のアタック(コンビ)から", () => {
    let rally = plays("*5S", "a11R#", "a13E", "a8A", "*7D");
    rally = setType(rally, 0, "hitType", "Q");
    rally = setType(rally, 3, "combination", "PV");
    const suggestions = suggestTypes(rally, { lineup: LINEUP });
    expect(suggestions[1].hitType).toMatchObject({ top: "Q", isConfident: true, basis: "サーブの種類から" });
    expect(suggestions[3].hitType).toMatchObject({ top: "M", isConfident: true });
    expect(suggestions[2].targetAttacker).toMatchObject({ top: "F", isConfident: true });
    // 次のアタックの種類が自動で入るまでは、E の種類は迷う
    expect(suggestions[2].hitType?.isConfident).toBe(false);
  });

  it("コール:前のタッチの評価から(迷う)。次のアタックのコンビが A クイックなら KA", () => {
    const rally = plays("*5S", "a11R#", "a13E", "a8A");
    expect(suggestTypes(rally)[2].combination).toMatchObject({ top: "KA", isConfident: false });
    expect(suggestTypes(plays("*5S", "a11R-", "a13E", "a8A"))[2].combination).toMatchObject({ top: "", isConfident: true });
    const withAttack = setType(rally, 3, "combination", "PA");
    expect(suggestTypes(withAttack)[2].combination).toMatchObject({ top: "KA", isConfident: true });
  });

  it("コンビ:前衛・後衛とセッターからの位置、コールから。始まりのゾーンを人が押していれば、それも使う", () => {
    let rally = plays("*5S", "a11R#", "a13E", "a8A");
    rally = setType(rally, 2, "combination", "KA");
    const plain = suggestTypes(rally, { lineup: LINEUP })[3].combination;
    expect(plain?.isConfident).toBe(false);
    expect(plain?.candidates.length).toBeGreaterThan(9);
    // スタメンがなければ、全体の割合(PV が一番)
    expect(suggestTypes(rally)[3].combination).toMatchObject({ top: "PV", isConfident: false });
    const zoned = rally.map((play, index) => (index === 3 ? { ...play, startZone: 4, startZoneSource: "manual" as const } : play));
    const lineup = { ...LINEUP, away: { ...LINEUP.away, setterAt: 5 } }; // 8番 = 前衛4、セッターからの位置 5
    expect(suggestTypes(zoned, { lineup })[3].combination?.top).toBe("PV");
  });

  it("打ち方は H が一番。ブロックの人数はコンビとこの試合のこれまでから", () => {
    let rally = plays("*5S", "a11R#", "a13E", "a8A-", "*7D");
    rally = setType(rally, 3, "combination", "PV");
    const [, , , attack] = suggestTypes(rally);
    expect(attack.skillType).toMatchObject({ top: "H", isConfident: false });
    expect(attack.players).toMatchObject({ top: "2", isConfident: false });
    const history = emptyTypeHistory();
    history.blockers.set("a|PV", new Map([["1", 20]]));
    expect(suggestTypes(rally, { history })[3].players?.top).toBe("1");
  });

  it("B の人数・種類は、前のアタックを写す", () => {
    let rally = plays("*5S", "a11R#", "a13E", "a8A", "*14B");
    rally = setType(rally, 3, "players", "1");
    rally = setType(rally, 3, "hitType", "Q");
    const block = suggestTypes(rally)[4];
    expect(block.players).toMatchObject({ top: "1", isConfident: true });
    expect(block.hitType).toMatchObject({ top: "Q", isConfident: true });
  });
});

describe("P4:自動で入れる・人が決める", () => {
  it("決めた欄から写せる欄を、つぎつぎに自動で入れる(コンビ → アタックの種類 → トスの種類)", () => {
    let rally = plays("*5S", "a11R#", "a13E", "a8A", "*7D");
    rally = setType(rally, 0, "hitType", "H");
    rally = setType(rally, 3, "combination", "PV");
    const auto = applyAutoTypes(rally, { lineup: LINEUP });
    expect(auto[1]).toMatchObject({ hitType: "H", typeSource: { hitType: "auto" } });
    expect(auto[3]).toMatchObject({ hitType: "M", typeSource: { combination: "manual", hitType: "auto" } });
    expect(auto[2]).toMatchObject({ hitType: "M", targetAttacker: "F" });
    expect(auto[2].typeSource).toMatchObject({ hitType: "auto", targetAttacker: "auto" });
    expect(auto[4]).toMatchObject({ hitType: "M", typeSource: { hitType: "auto" } });
    // 同じなら元の配列のまま
    expect(applyAutoTypes(auto, { lineup: LINEUP })).toBe(auto);
  });

  it("コンビを変えると、写した欄も入れ直す。消した欄は自動で入れ直さない", () => {
    let rally = plays("*5S", "a11R#", "a13E", "a8A");
    rally = setType(rally, 3, "combination", "PV");
    rally = applyAutoTypes(rally);
    rally = applyAutoTypes(setType(rally, 3, "combination", "PA"));
    expect(rally[3]).toMatchObject({ combination: "PA", hitType: "Q" });
    expect(rally[2]).toMatchObject({ combination: "KA", targetAttacker: "C", hitType: "Q" });
    expect(rally[2].typeSource?.combination).toBe("auto");
    const cleared = applyAutoTypes(setType(rally, 2, "targetAttacker", null));
    expect(cleared[2].targetAttacker).toBeUndefined();
    expect(cleared[2].typeSource?.targetAttacker).toBe("cleared");
    expect(isTypeDecided(cleared[2], "targetAttacker")).toBe(false);
  });

  it("「なし」も決めたものとして持つ。ブロックの人数は数で持つ", () => {
    const [attack] = plays("a8A");
    const none = setPlayType(attack, "combination", "");
    expect(none.combination).toBeUndefined();
    expect(readTypeValue(none, "combination")).toBe("");
    expect(isTypeDecided(none, "combination")).toBe(true);
    expect(setPlayType(attack, "players", "2").players).toBe(2);
    // 「なし」のない欄には入れない
    expect(setPlayType(attack, "skillType", "")).toBe(attack);
  });

  it("code に入る欄を変えたら、読み込んだ code を捨てる", () => {
    const loaded: IaPlay = { id: "x", team: "a", player: 8, skill: "A", hitType: "M", combination: "PV", code: "a8APV." };
    expect(setPlayType(loaded, "combination", "PZ").code).toBeUndefined();
    expect(setPlayType(loaded, "skillType", "T").code).toBe("a8APV.");
  });

  it("VSM から読み込んだタッチは変えない(欄がなければ「なし」と決めたもの)", () => {
    const loaded: IaPlay[] = [
      { id: "s", team: "*", player: 5, skill: "S", hitType: "Q", effect: "-" },
      { id: "r", team: "a", player: 11, skill: "R", hitType: "M", effect: "#" },
      { id: "e", team: "a", player: 13, skill: "E", hitType: "M", effect: "+" },
    ];
    expect(applyAutoTypes(loaded)).toBe(loaded);
    expect(readTypeValue(loaded[2], "combination")).toBe("");
    expect(fieldsToReview(loaded[2], suggestTypes(loaded)[2], "unsure")).toEqual([]);
  });

  it("アタックのコンビを決めると、P3 のアタックの始まり(とトスの終わり)が入る", () => {
    let rally = plays("*5S", "a11R#", "a13E", "a8A");
    rally = applyTypesAndZones(setType(rally, 3, "combination", "PV"));
    expect(rally[3]).toMatchObject({ startZone: 4, startSubZone: "C", startZoneSource: "auto" });
    expect(rally[2]).toMatchObject({ endZone: 4, endSubZone: "C", endZoneSource: "auto" });
    rally = applyTypesAndZones(setType(rally, 3, "combination", "PZ"));
    expect(rally[3]).toMatchObject({ startZone: 2, startSubZone: "B" });
    expect(rally[2]).toMatchObject({ endZone: 2, endSubZone: "B" });
  });

  it("P1 でスキルを変えたら、P4 の種類は決め直す", () => {
    const [attack] = plays("a8A");
    const typed = setPlayType(setPlayType(attack, "combination", "PV"), "players", "2");
    const edited = editFlowPlay(typed, { skill: "D" });
    expect(edited).not.toHaveProperty("combination");
    expect(edited).not.toHaveProperty("players");
    expect(edited).not.toHaveProperty("typeSource");
  });

  it("保存の前に形を整えても、typeSource は残る(知らない値は捨てる)", () => {
    const set = normalizeSet(
      {
        setIndex: 1,
        rallies: [
          {
            id: "r1",
            serveTime: 10,
            side: "near",
            plays: [{ id: "p", team: "a", player: 8, skill: "A", combination: "PV", typeSource: { combination: "manual", hitType: "x" } }],
          },
        ],
      },
      1,
    );
    expect(set.rallies[0].plays?.[0].typeSource).toEqual({ combination: "manual" });
  });
});

describe("P4:セットの並びと進み具合", () => {
  function p1Set(): IaSet {
    return {
      ...createEmptySet(1),
      startingLineup: LINEUP,
      finalScore: { home: 0, away: 2 },
      rallies: [
        {
          id: "a".repeat(24),
          serveTime: 131.8,
          side: "near",
          status: "rally",
          source: "auto",
          flowDone: true,
          plays: plays("a11R#", "a13E", "a8A", "*7D").map((play, index) => ({ ...play, id: String(index + 1).repeat(24), source: "manual" as const })),
        },
        { id: "b".repeat(24), serveTime: 149.2, side: "far", status: "rally", source: "auto", flowDone: true },
      ],
    };
  }

  it("迷う欄のあるタッチだけを並べる。サーブを決めると、レセプションは並びから外れる", () => {
    const set = p1Set();
    const entries = typeRallies(set);
    expect(entries).toHaveLength(2);
    expect(entries[0].plays.map((play) => play.skill)).toEqual(["S", "R", "E", "A", "D"]);
    const unsure = buildTypeQueue(entries, "unsure");
    expect(unsure.map((item) => item.playId)).toContain("1".repeat(24));
    const serveId = entries[0].plays[0].id;
    const decided: IaSet = {
      ...set,
      rallies: set.rallies.map((rally, index) =>
        index === 0 ? { ...rally, plays: entries[0].plays.map((play) => (play.id === serveId ? setPlayType(play, "hitType", "Q") : play)) } : rally,
      ),
    };
    const after = typeRallies(decided);
    expect(after[0].plays[1]).toMatchObject({ hitType: "Q", typeSource: { hitType: "auto" } });
    expect(buildTypeQueue(after, "unsure").map((item) => item.playId)).not.toContain("1".repeat(24));
    expect(buildTypeQueue(after, "all").length).toBeGreaterThan(buildTypeQueue(after, "unsure").length);
  });

  it("トスのすぐあとに同じチームのアタックがあれば、アタックを先に見る(ほかはタッチの順)", () => {
    expect(typeReviewOrder(plays("*5S", "a11R", "a13E", "a8A", "*7D", "*12E", "*24A", "a9B"))).toEqual([0, 1, 3, 2, 4, 6, 5, 7]);
    // 相手のアタック・トスで終わるときは、そのまま
    expect(typeReviewOrder(plays("*5S", "a11R", "a13E", "*7A"))).toEqual([0, 1, 2, 3]);
    expect(typeReviewOrder(plays("*5S", "a11R", "a13E"))).toEqual([0, 1, 2]);
    const all = buildTypeQueue(typeRallies(p1Set()), "all");
    expect(all.slice(0, 5).map((item) => item.playId)).toEqual([
      expect.any(String),
      "1".repeat(24),
      "3".repeat(24),
      "2".repeat(24),
      "4".repeat(24),
    ]);
  });

  it("セッションのこれまで(ほかのセットも)を数え、進み具合を出す", () => {
    const set = p1Set();
    const serve: IaPlay = { id: "s", team: "*", player: 5, skill: "S", source: "auto", hitType: "Q", typeSource: { hitType: "manual" } };
    const history = buildTypeHistory([{ ...set, rallies: [{ ...set.rallies[0], plays: [serve] }] }, { ...set, skipped: true }]);
    expect(history.serve.get("*|5")?.get("Q")).toBe(1);
    const [progress] = typeProgress([set]);
    expect(progress).toMatchObject({ setIndex: 1, rallies: 2 });
    expect(progress.total).toBe(1 + 1 + 3 + 4 + 1 + 1);
    expect(progress.remaining).toBeGreaterThan(0);
    expect(applyAutoTypesToSet(set)).not.toBe(set);
    const applied = applyAutoTypesToSet(set);
    expect(applyAutoTypesToSet(applied)).toBe(applied);
  });
});
