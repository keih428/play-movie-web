import { describe, expect, it } from "vitest";
import {
  EFFECT_BY_KEY,
  applyAutoEffects,
  applyAutoEffectsToSet,
  buildEffectQueue,
  effectContextKey,
  effectHints,
  effectProgress,
  effectRallies,
  nextUndecided,
  setPlayEffect,
  suggestEffect,
  suggestEffects,
} from "@/lib/domain/input-assist/effect";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import type { IaPlay, IaSet, IaSkill, IaTeamCode } from "@/lib/domain/input-assist/types";

function plays(...entries: string[]): IaPlay[] {
  // "*5S" "a11R" のように、チーム(* か a)・背番号・スキル。"=" などを後ろに付けると評価
  return entries.map((entry, index) => {
    const match = /^([*a])(\d+)([SREABDF])([#+!\-/=])?$/.exec(entry);
    if (!match) {
      throw new Error(entry);
    }
    const play: IaPlay = { id: `p${index}`, team: match[1] as IaTeamCode, player: Number(match[2]), skill: match[3] as IaSkill };
    if (match[4]) {
      play.effect = match[4];
    }
    return play;
  });
}

describe("P2:評価の候補", () => {
  it("表の鍵:次のタッチが同じチームか相手か。最後なら点を取ったか", () => {
    const rally = plays("*5S", "a11R", "a13E", "a8A", "*7D");
    expect(effectContextKey(rally, 0, "a")).toBe("S|other:R|");
    expect(effectContextKey(rally, 1, "a")).toBe("R|same:E|");
    expect(effectContextKey(rally, 3, "a")).toBe("A|other:D|");
    expect(effectContextKey(rally, 4, "a")).toBe("D|end|lost");
    expect(effectContextKey(rally, 4, "*")).toBe("D|end|won");
  });

  it("ほぼ決まる評価は迷わない(E → 同じチームの A は +、最後に点を取ったアタックは #、取られたアタックは =)", () => {
    const won = suggestEffects(plays("*5S", "a11R", "a13E", "a8A"), "a");
    expect(won[2]).toMatchObject({ top: "+", isConfident: true, fromContext: true });
    expect(won[3]).toMatchObject({ top: "#", isConfident: true });
    expect(won[3].probability).toBeGreaterThan(0.99);
    const lost = suggestEffects(plays("*5S", "a11R", "a13E", "a8A"), "*");
    expect(lost[3]).toMatchObject({ top: "=", isConfident: true });
    // D → 同じチームの E は +(95.8%)
    expect(suggestEffect(plays("a8A", "*7D", "*12E"), 1, "*")).toMatchObject({ top: "+", isConfident: true });
  });

  it("迷う評価:サーブ → 相手の R(- が 6 割)、R → 同じチームの E、A → 相手の B", () => {
    const rally = suggestEffects(plays("*5S", "a11R", "a13E", "a8A", "*14B"), "a");
    expect(rally[0]).toMatchObject({ top: "-", isConfident: false });
    expect(rally[0].probability).toBeCloseTo(0.615);
    expect(rally[1]).toMatchObject({ top: "#", isConfident: false });
    expect(rally[3].isConfident).toBe(false);
  });

  it("候補は6つすべてを出やすい順に。表にない評価は 0", () => {
    const [serve] = suggestEffects(plays("*5S", "a11R"), "a");
    expect(serve.candidates.map((candidate) => candidate.effect)).toEqual(["-", "!", "+", "/", "#", "="]);
    expect(serve.candidates.at(-1)).toEqual({ effect: "=", probability: 0 });
  });

  it("表にない(数の少ない)前後は、スキルだけの表から出し、自動では入れない", () => {
    // E → 同じチームの E は表にない。スキルだけの E は + が 95%
    const suggestion = suggestEffect(plays("a13E", "a8E", "a8A"), 0, "a");
    expect(suggestion.fromContext).toBe(false);
    expect(suggestion.top).toBe("+");
    expect(suggestion.isConfident).toBe(false);
  });

  it("キー:1〜6 と記号そのもの", () => {
    expect(["1", "2", "3", "4", "5", "6"].map((key) => EFFECT_BY_KEY[key])).toEqual(["#", "+", "!", "-", "/", "="]);
    expect(EFFECT_BY_KEY["="]).toBe("=");
    expect(EFFECT_BY_KEY["7"]).toBeUndefined();
  });
});

describe("P2:自動の評価と人の評価", () => {
  it("迷わないタッチだけ自動で入れる。人が決めた評価・読み込んだ評価は変えない", () => {
    const rally = plays("*5S", "a11R", "a13E", "a8A", "*7D");
    rally[4] = { ...rally[4], effect: "-", effectSource: "manual" };
    const filled = applyAutoEffects(rally, "a");
    expect(filled.map((play) => [play.effect, play.effectSource])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
      ["+", "auto"],
      [undefined, undefined],
      ["-", "manual"],
    ]);
    // 変わらなければ同じ配列
    expect(applyAutoEffects(filled, "a")).toBe(filled);
    // VSM から読み込んだ評価(effectSource なし)は人が決めたものとして残す
    const imported = plays("*5S", "a11R", "a13E/", "a8A");
    expect(applyAutoEffects(imported, "a")[2]).toMatchObject({ effect: "/" });
    expect(applyAutoEffects(imported, "a")[2].effectSource).toBeUndefined();
  });

  it("流れが変わって迷うようになった自動の評価は消し、変わったものは入れ直す", () => {
    const filled = applyAutoEffects(plays("*5S", "a11R", "a13E", "a8A"), "a");
    expect(filled[3]).toMatchObject({ effect: "#", effectSource: "auto" });
    // 最後のアタックの点が逆になった → =
    expect(applyAutoEffects(filled, "*")[3]).toMatchObject({ effect: "=", effectSource: "auto" });
    // アタックのあとに相手の B が足された → 迷う → 消す
    const longer = [...filled, { id: "x", team: "*" as const, player: 14, skill: "B" as const }];
    const refilled = applyAutoEffects(longer, "a");
    expect(refilled[3].effect).toBeUndefined();
    expect(refilled[3]).not.toHaveProperty("effectSource");
  });

  it("人が決めると manual。評価が変わったら読み込んだ code は捨てる。消すと評価がなくなる", () => {
    const play: IaPlay = { id: "p", team: "a", player: 8, skill: "A", effect: "#", code: "a8A5#" };
    expect(setPlayEffect(play, "#")).toMatchObject({ effect: "#", effectSource: "manual", code: "a8A5#" });
    const changed = setPlayEffect(play, "-");
    expect(changed).toMatchObject({ effect: "-", effectSource: "manual" });
    expect(changed).not.toHaveProperty("code");
    const cleared = setPlayEffect({ ...play, effectSource: "manual" }, null);
    expect(cleared).not.toHaveProperty("effect");
    expect(cleared).not.toHaveProperty("effectSource");
  });
});

function p2Set(): IaSet {
  const set = createEmptySet(1);
  return {
    ...set,
    startingLineup: {
      home: { positions: { "1": 5, "2": 12, "3": 14, "4": 24, "5": 29, "6": 7 }, setterAt: 5 },
      away: { positions: { "1": 13, "2": 3, "3": 9, "4": 8, "5": 5, "6": 11 }, setterAt: 1 },
    },
    finalScore: { home: 0, away: 3 },
    rallies: [
      // 1本目:東大のサーブ → 相手が切り返して得点
      {
        id: "r1",
        serveTime: 100,
        side: "near",
        status: "rally",
        source: "auto",
        flowDone: true,
        plays: plays("a11R", "a13E", "a8A", "*7D").map((play, index) => ({ ...play, id: `r1-${index}`, time: 102 + index, source: "manual" as const })),
      },
      // 2本目:相手のサーブだけ(エース)。サイドアウトでローテーションしたので 3番のサーブ
      { id: "r2", serveTime: 120, side: "far", status: "rally", source: "auto", flowDone: true },
      // 3本目:まだ P1 を入れていない
      { id: "r3", serveTime: 140, side: "far", status: "rally", source: "auto" },
      // ラリーでないもの
      { id: "r4", serveTime: 160, side: "far", status: "not_rally", source: "auto" },
    ],
  };
}

describe("P2:人が決めるタッチの並び・進み具合", () => {
  it("P1 を入れ終えたラリーだけ。サーブを先頭に置き、自動の評価を入れる", () => {
    const entries = effectRallies(p2Set());
    expect(entries.map((entry) => entry.rally.id)).toEqual(["r1", "r2"]);
    expect(entries[0].plays.map((play) => `${play.team}${play.player}${play.skill}${play.effect ?? "?"}`)).toEqual([
      "*5S?",
      "a11R?",
      "a13E+",
      "a8A?",
      "*7D=",
    ]);
    expect(entries[1].plays.map((play) => `${play.team}${play.player}${play.skill}${play.effect ?? "?"}`)).toEqual(["a3S#"]);
  });

  it("迷うものだけ / 全部。ラリーの順、タッチの順", () => {
    const entries = effectRallies(p2Set());
    const unsure = buildEffectQueue(entries, "unsure");
    // サーブ(id はラリーから決まる)・R・A が迷う。E と最後の D、エースは自動
    expect(unsure.map((item) => item.playId)).toEqual(["r1-s", "r1-0", "r1-2"]);
    expect(buildEffectQueue(entries, "all")).toHaveLength(6);
  });

  it("次に決めるタッチ:後ろの決まっていないもの。なければ先頭から", () => {
    const queue = ["a", "b", "c", "d"].map((playId) => ({ rallyId: "r", playId }));
    const decided = new Set(["b"]);
    const isDecided = (item: { playId: string }) => decided.has(item.playId);
    expect(nextUndecided(queue, isDecided, null)?.playId).toBe("a");
    expect(nextUndecided(queue, isDecided, queue[0])?.playId).toBe("c");
    decided.add("d");
    expect(nextUndecided(queue, isDecided, queue[2])?.playId).toBe("a");
    decided.add("a");
    decided.add("c");
    expect(nextUndecided(queue, isDecided, queue[2])).toBeNull();
  });

  it("進み具合:決まった数(自動を含む)/ 全部、迷う残り", () => {
    const set = p2Set();
    expect(effectProgress([set])).toEqual([{ setIndex: 1, decided: 3, total: 6, remaining: 3, rallies: 2 }]);
    expect(effectProgress([{ ...set, skipped: true }])).toEqual([]);
  });

  it("セットに自動の評価を保存する(変わらなければ同じセット)", () => {
    const set = applyAutoEffectsToSet(p2Set());
    const r1 = set.rallies.find((rally) => rally.id === "r1");
    expect(r1?.plays?.map((play) => play.effect ?? "?")).toEqual(["?", "?", "+", "?", "="]);
    expect(r1?.plays?.[0].skill).toBe("S");
    expect(set.rallies.find((rally) => rally.id === "r3")?.plays).toBeUndefined();
    expect(applyAutoEffectsToSet(set)).toBe(set);
  });
});

describe("P2:注意", () => {
  it("最後のタッチと点:取った側のアタックは #、取られた側は =", () => {
    expect(effectHints(plays("*5S-", "a11R#", "a13E+", "a8A+"), "a").map((hint) => hint.message)).toEqual([
      "最後は点を取った側のアタックです。評価は # では?",
    ]);
    expect(effectHints(plays("*5S-", "a11R#", "a13E+", "a8A#", "*7D+"), "a").map((hint) => hint.playId)).toEqual(["p4"]);
    expect(effectHints(plays("*5S-", "a11R#", "a13E+", "a8A#", "*7D="), "a")).toEqual([]);
  });

  it("= のあとにタッチがある", () => {
    expect(effectHints(plays("*5S-", "a11R=", "a13E+"), "a").map((hint) => hint.playId)).toContain("p1");
  });

  it("サーブとレセプション:S - なのに R - や /、S + なのに R #、S # なのに R が = でない", () => {
    const messages = (rally: IaPlay[]) => effectHints(rally, "*").filter((hint) => hint.message.includes("サーブ")).map((hint) => hint.message);
    expect(messages(plays("*5S-", "a11R-"))).toHaveLength(1);
    expect(messages(plays("*5S-", "a11R/"))).toHaveLength(1);
    expect(messages(plays("*5S-", "a11R#"))).toHaveLength(0);
    expect(messages(plays("*5S+", "a11R#"))).toHaveLength(1);
    expect(messages(plays("*5S+", "a11R!"))).toHaveLength(0);
    expect(messages(plays("*5S#", "a11R="))).toHaveLength(0);
    expect(messages(plays("*5S#", "a11R!"))).toHaveLength(1);
    // 決まっていない評価は見ない
    expect(messages(plays("*5S", "a11R-"))).toHaveLength(0);
  });
});
