import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readScoutRosterFile, setsFromVsmMatch } from "@/lib/domain/input-assist/roster";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import type { InputAssistSession } from "@/lib/domain/input-assist/types";
import { buildVsm, buildVsmFileName, buildVsmText } from "@/lib/domain/input-assist/vsm-writer";
import { parseVsmText } from "@/lib/parsers/vsm";

const SAMPLE_PATH = path.resolve(__dirname, "../../../vsm/2026-06-24 UTVB-TIT.vsm");
const sampleText = readFileSync(SAMPLE_PATH, "utf8");

function sessionFromSample(): InputAssistSession {
  const roster = readScoutRosterFile(sampleText, "sample.vsm");
  const match = roster.matches[0];
  return {
    id: "s1",
    teamSlug: "utvb",
    title: "東北学院工学部戦",
    date: "2026-06-24",
    opponent: "東北学院工学部",
    teams: match.teams,
    extras: match.extras,
    sets: setsFromVsmMatch(match.raw),
    passLogs: [],
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}

let counter = 0;
const idFactory = () => (counter += 1).toString(16).padStart(24, "0");

describe("打ち込み補助:VSM の書き出し", () => {
  it("書き出した VSM を今のパーサーで読める(スコア・ラリー数・選手が元と同じ)", () => {
    const session = sessionFromSample();
    const text = buildVsmText(session, { now: new Date("2026-11-10T00:00:00Z"), idFactory });
    const parsed = parseVsmText(text, buildVsmFileName(session)).matches[0];
    const original = parseVsmText(sampleText, "sample.vsm").matches[0];

    expect(parsed.teams.home.name).toBe(original.teams.home.name);
    expect(parsed.teams.away.players?.length).toBe(original.teams.away.players?.length);
    expect(parsed.sets.map((set) => set.score)).toEqual(original.sets.map((set) => set.score));
    parsed.sets.forEach((set, index) => {
      const rallies = set.events.filter((event) => event.plays.length > 0);
      const originalRallies = original.sets[index].events.filter((event) => event.plays.length > 0);
      expect(rallies).toHaveLength(originalRallies.length);
      expect(rallies.map((event) => event.score)).toEqual(originalRallies.map((event) => event.score));
      expect(rallies.map((event) => event.point)).toEqual(originalRallies.map((event) => event.point));
      // 入っていたプレーはそのまま残る
      expect(rallies.map((event) => event.plays.length)).toEqual(originalRallies.map((event) => event.plays.length));
    });
  });

  it("チーム・攻撃コンビ・セッターコールは読み込んだものをそのまま。交代・タイムアウト・プレーの欄も元のまま", () => {
    const session = sessionFromSample();
    const original = JSON.parse(sampleText);
    const vsm = JSON.parse(buildVsmText(session, { idFactory })) as typeof original;
    expect(vsm.team).toEqual(original.team);
    // 攻撃コンビは元のファイルではなく、昨シーズンの手直し版(P1・P5・PA にサブゾーン)。コードの並びは同じ
    expect((vsm.attackCombinations as { code: string }[]).map((c) => c.code)).toEqual(
      (original.attackCombinations as { code: string }[]).map((c) => c.code),
    );
    expect(vsm.setterCalls).toHaveLength(18);
    expect(vsm.spectators).toBeNull();
    expect(vsm.gameType).toBe("indoor");
    expect(vsm.version).toBe(1);
    vsm.scout.sets.forEach((set: { events: Array<Record<string, any>> }, setIndex: number) => {
      const originalEvents = (original.scout.sets[setIndex].events as Array<Record<string, any>>).filter(
        (event) => event.exchange || event.substitution || event.timeout,
      );
      const kinds = (events: Array<Record<string, any>>) =>
        events.map((event) => (event.exchange ? "rally" : event.substitution ? "sub" : "timeout"));
      expect(kinds(set.events)).toEqual(kinds(originalEvents));
      set.events.forEach((event, index) => {
        const source = originalEvents[index];
        expect(event.lineup).toEqual(source.lineup);
        expect(event.score).toEqual(source.score);
        if (event.exchange) {
          event.exchange.plays.forEach((play: Record<string, unknown>, playIndex: number) => {
            const { originalTime: _drop, ...rest } = source.exchange.plays[playIndex];
            void _drop;
            // code のないプレー(元に1つある)には、書き出しで code を作る
            expect(play).toEqual({ ...rest, code: rest.code ?? play.code, originalTime: play.time });
          });
        }
      });
    });
  });

  it("scout.video.path はいつも入れる(空だとバレーステーションが読まない)", () => {
    const session = sessionFromSample();
    const vsm = buildVsm(session) as { scout: { video: { path: string } } };
    expect(vsm.scout.video.path).toBe("20260624_東北学院工学部.mp4");
    const custom = buildVsm(session, { videoPath: "match.mp4" }) as { scout: { video: { path: string } } };
    expect(custom.scout.video.path).toBe("match.mp4");
  });

  it("骨組みだけのラリーには、サーバーのサーブ(M・-)を1つ入れる。時刻は 10 倍", () => {
    const set = {
      ...createEmptySet(1),
      startingLineup: {
        home: { positions: { "1": 5, "2": 12, "3": 14, "4": 24, "5": 29, "6": 7 } as const, setterAt: 5 },
        away: { positions: { "1": 13, "2": 3, "3": 9, "4": 8, "5": 5, "6": 11 } as const, setterAt: 1 },
      },
      finalScore: { home: 0, away: 2 },
      rallies: [
        { id: "a".repeat(24), serveTime: 131.86, side: "near" as const, status: "rally" as const, source: "auto" as const },
        { id: "b".repeat(24), serveTime: 149.2, side: "far" as const, status: "rally" as const, source: "auto" as const },
        { id: "c".repeat(24), serveTime: 160, side: null, status: "rally" as const, source: "auto" as const },
      ],
      substitutions: [{ id: "d".repeat(24), time: 140, team: "away" as const, playerIn: 20, playerOut: 3 }],
      timeouts: [{ id: "e".repeat(24), time: 140, team: "home" as const }],
    };
    const session: InputAssistSession = { ...sessionFromSample(), sets: [set] };
    const vsm = buildVsm(session, { idFactory }) as {
      scout: { sets: Array<{ events: Array<Record<string, any>>; score: unknown }> };
    };
    const events = vsm.scout.sets[0].events;
    expect(events).toHaveLength(4);
    expect(events[0].exchange.plays[0]).toMatchObject({
      team: "*",
      player: "05",
      skill: "S",
      hitType: "M",
      effect: "-",
      code: "5SM.",
      time: 1319,
      originalTime: 1319,
    });
    expect(events[0].exchange.point).toBe("a");
    // 同じ時刻ならタイムアウトが先
    expect(events[1]).toMatchObject({ timeout: { team: "*" }, score: { home: 0, away: 1 } });
    // アウェイが点を取ってサーブ権を得たので、ラリーの間の並びはローテーションしたあと(もとの 2 の 3 が 1 へ)
    expect(events[1].lineup.away.positions["1"]).toBe(3);
    expect(events[1].lineup.away.setterAt).toBe(6);
    expect(events[2].substitution).toEqual({ playerIn: 20, playerOut: 3, team: "a" });
    expect(events[2].lineup.away.positions["1"]).toBe(20);
    // 交代で入った 20 番がサーブ
    expect(events[3].exchange.plays[0]).toMatchObject({ team: "a", player: "20", code: "a20SM.", time: 1492 });
    expect(events[3].lineup.away.setterAt).toBe(6);
    expect(vsm.scout.sets[0].score).toEqual({ home: 0, away: 2 });
  });
});

describe("攻撃コンビ・セッターコール", () => {
  it("いつも昨シーズンの手直し版(P1 はゾーン4のサブゾーン C)を使う", async () => {
    const { DEFAULT_ATTACK_COMBINATIONS, DEFAULT_SETTER_CALLS } = await import("@/lib/domain/input-assist/vsm-defaults");
    const p1 = (DEFAULT_ATTACK_COMBINATIONS as { code: string; start: { zone: number; subZone?: string } }[]).find((c) => c.code === "P1");
    expect(p1?.start).toEqual({ zone: 4, subZone: "C" });
    expect(DEFAULT_ATTACK_COMBINATIONS).toHaveLength(32);
    expect(DEFAULT_SETTER_CALLS).toHaveLength(18);
  });
});

describe("このセットは打たない", () => {
  it("印を付けたセットは、書き出しと得点の確認から外れる", async () => {
    const { checkSets } = await import("@/lib/domain/input-assist/session");
    const s1 = { ...createEmptySet(1), skipped: true };
    const s2 = createEmptySet(2, s1);
    const session = { sets: [s1, s2] } as unknown as InputAssistSession;
    expect(checkSets(session).map((c) => c.setIndex)).toEqual([2]);
  });
});

describe("P1 のタッチの書き出し", () => {
  function p1Session(): InputAssistSession {
    const set = {
      ...createEmptySet(1),
      startingLineup: {
        home: { positions: { "1": 5, "2": 12, "3": 14, "4": 24, "5": 29, "6": 7 } as const, setterAt: 5 },
        away: { positions: { "1": 13, "2": 3, "3": 9, "4": 8, "5": 5, "6": 11 } as const, setterAt: 1 },
      },
      finalScore: { home: 0, away: 2 },
      rallies: [
        {
          id: "a".repeat(24),
          serveTime: 131.8,
          side: "near" as const,
          status: "rally" as const,
          source: "auto" as const,
          flowDone: true,
          plays: [
            { id: "1".repeat(24), team: "a" as const, player: 11, skill: "R" as const, time: 133.2, source: "manual" as const },
            { id: "2".repeat(24), team: "a" as const, player: 13, skill: "E" as const, time: 134.4, source: "manual" as const },
            { id: "3".repeat(24), team: "a" as const, player: 8, skill: "A" as const, time: 135.1, source: "manual" as const },
            { id: "4".repeat(24), team: "*" as const, player: 7, skill: "D" as const, time: 135.6, source: "manual" as const },
          ],
        },
        // サーブだけで入れ終えた(エース)
        { id: "b".repeat(24), serveTime: 149.2, side: "far" as const, status: "rally" as const, source: "auto" as const, flowDone: true },
      ],
    };
    return { ...sessionFromSample(), sets: [set] };
  }

  it("サーブのあとに入れた順で、仮の種類・評価と code を付ける。最後のタッチは点と合わせる", () => {
    const vsm = buildVsm(p1Session(), { idFactory }) as {
      scout: { sets: Array<{ events: Array<Record<string, any>> }> };
    };
    const [first, second] = vsm.scout.sets[0].events;
    expect(first.exchange.point).toBe("a");
    expect(first.exchange.plays.map((play: Record<string, unknown>) => [play.team, play.player, play.skill, play.hitType, play.effect, play.code, play.time, play.originalTime])).toEqual([
      ["*", "05", "S", "M", "-", "5SM.", 1318, 1318],
      ["a", "11", "R", "M", "#", ".11#", 1332, 1332],
      ["a", "13", "E", "M", "+", "a13E", 1344, 1344],
      ["a", "08", "A", "M", "#", "a8A.", 1351, 1351],
      // 点を取られた側が最後 → ミス。相手のアタックのあとのディグなので頭に "."
      ["*", "07", "D", "M", "=", ".7D=", 1356, 1356],
    ]);
    // P0 とエンジンのサーブには、ラリーから決まる id
    expect(first.exchange.plays[0]._id).toMatch(/^[0-9a-f]{24}$/);
    expect(first.exchange.plays[0]).not.toHaveProperty("source");
    // サーブだけで入れ終えたラリー:サーブした側の点 → エース
    expect(second.exchange.plays).toHaveLength(1);
    expect(second.exchange.plays[0]).toMatchObject({ team: "a", player: "03", effect: "#", code: "a3SM." });
  });

  it("書き出した VSM を今のパーサーで読むと、タッチの順・選手・スキル・評価・時刻がそろう", () => {
    const session = p1Session();
    const parsed = parseVsmText(buildVsmText(session, { idFactory }), buildVsmFileName(session)).matches[0];
    const rallies = parsed.sets[0].events.filter((event) => event.plays.length > 0);
    expect(rallies).toHaveLength(2);
    expect(rallies[0].point).toBe("a");
    expect(rallies[0].plays.map((play) => `${play.team}${play.player}${play.skill}${play.effect}@${play.time}`)).toEqual([
      "*05S-@1318",
      "a11R#@1332",
      "a13E+@1344",
      "a08A#@1351",
      "*07D=@1356",
    ]);
    expect(rallies.map((event) => event.score)).toEqual([
      { home: 0, away: 1 },
      { home: 0, away: 2 },
    ]);
    expect(parsed.sets[0].score).toEqual({ home: 0, away: 2 });
  });

  it("P0 でサーブの向きを変えたら、書き出すサーブも変わる(入れたタッチは残す)", () => {
    const session = p1Session();
    const set = session.sets[0];
    const flipped = {
      ...session,
      sets: [{ ...set, rallies: set.rallies.map((rally, index) => (index === 0 ? { ...rally, side: "far" as const } : rally)) }],
    };
    const vsm = buildVsm(flipped, { idFactory }) as { scout: { sets: Array<{ events: Array<Record<string, any>> }> } };
    const plays = vsm.scout.sets[0].events[0].exchange.plays;
    expect(plays[0]).toMatchObject({ team: "a", player: "13", skill: "S" });
    expect(plays).toHaveLength(5);
  });
});
