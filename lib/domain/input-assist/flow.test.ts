import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  contactsInPossession,
  flowProgress,
  flowWarnings,
  isShirtUnambiguous,
  placeholderEffects,
  predictNextPlay,
  serveIdFor,
  syncServePlay,
} from "@/lib/domain/input-assist/flow";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import type { IaLineup, IaPlay, IaSkill, IaTeamCode } from "@/lib/domain/input-assist/types";

function seq(...entries: string[]): Array<Pick<IaPlay, "team" | "skill">> {
  // "*S" "aR" のように、チーム(* か a)とスキル
  return entries.map((entry) => ({ team: entry[0] as IaTeamCode, skill: entry[1] as IaSkill }));
}

function plays(...entries: Array<[IaTeamCode, number, IaSkill]>): IaPlay[] {
  return entries.map(([team, player, skill], index) => ({ id: `p${index}`, team, player, skill }));
}

const homeLineup: IaLineup = { positions: { "1": 5, "2": 12, "3": 14, "4": 24, "5": 29, "6": 7 }, setterAt: 5 };
const awayLineup: IaLineup = { positions: { "1": 13, "2": 3, "3": 9, "4": 8, "5": 5, "6": 11 }, setterAt: 1 };
const homeTeam = { name: "東大", libero: [25], players: [{ shirtNumber: 29, lastName: "田中" }, { shirtNumber: 25 }] };
const awayTeam = { name: "相手", libero: [1], players: [] };

describe("P1:次のタッチの予想", () => {
  it("S → 相手の R → 同じチームの E → A → 相手の D(B も選べる)", () => {
    expect(predictNextPlay([], "a")).toMatchObject({ team: "a", skill: "S" });
    expect(predictNextPlay(seq("*S"))).toMatchObject({ team: "a", skill: "R" });
    expect(predictNextPlay(seq("*S", "aR"))).toMatchObject({ team: "a", skill: "E" });
    expect(predictNextPlay(seq("*S", "aR", "aE"))).toMatchObject({ team: "a", skill: "A" });
    const afterAttack = predictNextPlay(seq("*S", "aR", "aE", "aA"));
    expect(afterAttack).toMatchObject({ team: "*", skill: "D" });
    expect(afterAttack.alternatives).toContain("B");
  });

  it("B → 相手の D。D・F(1回目)→ 同じチームの E → A", () => {
    expect(predictNextPlay(seq("*S", "aR", "aE", "aA", "*B"))).toMatchObject({ team: "a", skill: "D" });
    expect(predictNextPlay(seq("*S", "aR", "aE", "aA", "*D"))).toMatchObject({ team: "*", skill: "E" });
    expect(predictNextPlay(seq("*S", "aR", "aE", "aA", "*D", "*E"))).toMatchObject({ team: "*", skill: "A" });
    expect(predictNextPlay(seq("aA", "*F"))).toMatchObject({ team: "*", skill: "E" });
  });

  it("攻撃せずに返したフリーボール(2回目以降の F)→ 相手の D", () => {
    expect(predictNextPlay(seq("aA", "*D", "*E", "*F"))).toMatchObject({ team: "a", skill: "D" });
  });

  it("1チーム3回まで(ブロックは数えない)。3回触ったら次は相手", () => {
    expect(contactsInPossession(seq("*S", "aR", "aE"))).toBe(2);
    expect(contactsInPossession(seq("aA", "*B", "*D"))).toBe(1);
    // R → D → E(3回目のトスは相手コートへ)
    expect(predictNextPlay(seq("*S", "aR", "aD", "aE"))).toMatchObject({ team: "*", skill: "D" });
    // ブロックのあとは数え直し
    expect(predictNextPlay(seq("*A", "aB", "aD"))).toMatchObject({ team: "a", skill: "E" });
  });
});

describe("P1:選手の候補", () => {
  it("R は後衛とリベロを先に(リベロ → 後衛 → 前衛)", () => {
    const candidates = buildCandidates(homeLineup, homeTeam, "R");
    expect(candidates.map((candidate) => candidate.shirt)).toEqual([25, 29, 7, 5, 24, 14, 12]);
    expect(candidates[0]).toMatchObject({ row: "libero", label: "リベロ", position: null });
    expect(candidates[1]).toMatchObject({ row: "back", label: "後衛5", isSetter: true, name: "田中" });
  });

  it("E はセッターを先に", () => {
    expect(buildCandidates(homeLineup, homeTeam, "E")[0]).toMatchObject({ shirt: 29, isSetter: true });
    expect(buildCandidates(awayLineup, awayTeam, "E")[0]).toMatchObject({ shirt: 13, position: "1" });
  });

  it("A は前衛を先に(後衛はそのあと、リベロは入れない)。B は前衛だけ", () => {
    expect(buildCandidates(homeLineup, homeTeam, "A").map((candidate) => candidate.shirt)).toEqual([24, 14, 12, 29, 7, 5]);
    expect(buildCandidates(homeLineup, homeTeam, "B").map((candidate) => candidate.label)).toEqual(["前衛4", "前衛3", "前衛2"]);
  });

  it("背番号:2桁か、その数字で始まる2桁の背番号がなければ決める", () => {
    const shirts = [3, 5, 8, 9, 11, 13];
    expect(isShirtUnambiguous("5", shirts)).toBe(true);
    expect(isShirtUnambiguous("1", shirts)).toBe(false);
    expect(isShirtUnambiguous("13", shirts)).toBe(true);
    expect(isShirtUnambiguous("5", [])).toBe(false);
  });
});

describe("P1:サーブ(いつも先頭)", () => {
  const rally = { id: "0123456789abcdef01234567", serveTime: 100.5 };

  it("サーブがなければ、P0 とエンジンのサーバーで作る。id はラリーから決まる", () => {
    const result = syncServePlay({ ...rally, plays: [] }, "away", 13);
    expect(result).toEqual([
      { id: serveIdFor(rally.id), team: "a", player: 13, skill: "S", time: 100.5, source: "auto" },
    ]);
    expect(serveIdFor(rally.id)).toMatch(/^[0-9a-f]{24}$/);
    expect(serveIdFor(rally.id)).not.toBe(rally.id);
  });

  it("P0 が変わったら、自動のサーブも合わせる(あとのタッチは残す)", () => {
    const first = syncServePlay({ ...rally, plays: [] }, "away", 13);
    const entered = [...first, { id: "r", team: "*" as const, player: 7, skill: "R" as const, time: 102 }];
    const moved = syncServePlay({ ...rally, serveTime: 99, plays: entered }, "home", 5);
    expect(moved[0]).toMatchObject({ id: first[0].id, team: "*", player: 5, time: 99, source: "auto" });
    expect(moved[1]).toBe(entered[1]);
    // 変わらなければ同じ配列
    expect(syncServePlay({ ...rally, serveTime: 99, plays: moved }, "home", 5)).toBe(moved);
  });

  it("人が編集したサーブの背番号は、チームが合っていれば残す", () => {
    const manual: IaPlay = { id: "s", team: "a", player: 20, skill: "S", time: 100.5, source: "manual" };
    expect(syncServePlay({ ...rally, plays: [manual] }, "away", 13)[0].player).toBe(20);
    expect(syncServePlay({ ...rally, plays: [manual] }, "home", 5)[0]).toMatchObject({ team: "*", player: 5, source: "auto" });
  });

  it("VSM から読み込んだタッチは書き換えない", () => {
    const imported: IaPlay[] = [{ id: "s", team: "a", player: 2, skill: "S", effect: "+", time: 50 }];
    expect(syncServePlay({ ...rally, plays: imported }, "home", 5)).toBe(imported);
  });
});

describe("P1:注意", () => {
  const context = {
    lineup: { home: homeLineup, away: awayLineup },
    teams: { home: homeTeam, away: awayTeam },
    pointWinner: "home" as const,
  };

  it("コートにいない選手・1チーム4回", () => {
    const messages = flowWarnings(
      plays(["a", 13, "S"], ["*", 25, "R"], ["*", 29, "E"], ["*", 99, "D"], ["*", 24, "A"]),
      context,
    ).map((warning) => warning.message);
    expect(messages).toContain("99番は、東大のコートにいません(交代の入れ忘れ?)");
    expect(messages).toContain("東大が4回続けて触っています");
  });

  it("最後が点を取られた側のアタック・点を取った側のディグなら、そっと知らせる", () => {
    const lost = flowWarnings(plays(["*", 5, "S"], ["a", 1, "R"], ["a", 13, "E"], ["a", 8, "A"]), context);
    expect(lost.at(-1)?.message).toContain("点を取られた側(相手)のアタック");
    const won = flowWarnings(plays(["a", 13, "S"], ["*", 25, "R"], ["*", 29, "E"], ["*", 24, "A"], ["a", 1, "D"], ["*", 7, "D"]), context);
    expect(won.at(-1)?.message).toContain("点を取った側(東大)のディグ");
    const ok = flowWarnings(plays(["a", 13, "S"], ["*", 25, "R"], ["*", 29, "E"], ["*", 24, "A"]), context);
    expect(ok).toEqual([]);
  });
});

describe("P1:書き出しの仮の評価", () => {
  it("田中のデータで一番多い評価。最後のタッチは点と合わせる", () => {
    const rally = plays(["*", 5, "S"], ["a", 1, "R"], ["a", 13, "E"], ["a", 8, "A"], ["*", 7, "D"]);
    // 東大のディグが最後で、点は相手 → ディグのミス
    expect(placeholderEffects(rally, "a", true)).toEqual(["-", "#", "+", "#", "="]);
    // 相手のアタックが最後で点は相手 → 決まった
    expect(placeholderEffects(rally.slice(0, 4), "a", true)).toEqual(["-", "#", "+", "#"]);
    // 最後が F(点を取った側)なら、ふだんの仮の評価
    expect(placeholderEffects(plays(["*", 5, "S"], ["a", 1, "F"]), "a", true)).toEqual(["-", "+"]);
  });

  it("サーブだけ:入れ終えていればエース(#)かサーブミス(=)。まだなら -", () => {
    const serve = plays(["*", 5, "S"]);
    expect(placeholderEffects(serve, "*", true)).toEqual(["#"]);
    expect(placeholderEffects(serve, "a", true)).toEqual(["="]);
    expect(placeholderEffects(serve, "a", false)).toEqual(["-"]);
  });

  it("決まっている評価(P2・読み込んだもの)は変えない", () => {
    const rally = plays(["*", 5, "S"], ["a", 1, "R"]);
    rally[1].effect = "!";
    expect(placeholderEffects(rally, "*", true)).toEqual(["-", "!"]);
  });
});

describe("P1:進み具合", () => {
  it("得点の計算に使うラリーのうち、入れ終えたもの", () => {
    const set = {
      ...createEmptySet(1),
      rallies: [
        { id: "r1", serveTime: 10, side: "near" as const, status: "rally" as const, source: "auto" as const, flowDone: true },
        { id: "r2", serveTime: 20, side: "far" as const, status: "rally" as const, source: "auto" as const },
        { id: "r3", serveTime: 30, side: null, status: "rally" as const, source: "auto" as const },
        { id: "r4", serveTime: 40, side: "far" as const, status: "not_rally" as const, source: "auto" as const, flowDone: true },
      ],
    };
    const skipped = { ...createEmptySet(2), skipped: true };
    expect(flowProgress([set, skipped])).toEqual([{ setIndex: 1, entered: 1, total: 2 }]);
  });
});
