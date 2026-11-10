import { describe, expect, it } from "vitest";
import {
  PRESENCE_STALE_MS,
  buildBoard,
  cellStatus,
  formatAgo,
  isHeldByOther,
  isPresenceStale,
  passReadiness,
  type IaAssignment,
} from "@/lib/domain/input-assist/board";
import { createEmptySet } from "@/lib/domain/input-assist/session";
import type { IaSet } from "@/lib/domain/input-assist/types";

const NOW = Date.parse("2026-11-10T12:00:00.000Z");

function ago(ms: number) {
  return new Date(NOW - ms).toISOString();
}

function assignment(extra: Partial<IaAssignment> = {}): IaAssignment {
  return {
    setIndex: 1,
    pass: "P0",
    holderId: null,
    holderName: null,
    heartbeatAt: null,
    done: false,
    doneByName: null,
    doneAt: null,
    ...extra,
  };
}

describe("担当の「まだいる」", () => {
  it("2 分より前なら止まっている", () => {
    expect(isPresenceStale(ago(10 * 1000), NOW)).toBe(false);
    expect(isPresenceStale(ago(PRESENCE_STALE_MS - 1000), NOW)).toBe(false);
    expect(isPresenceStale(ago(PRESENCE_STALE_MS + 1000), NOW)).toBe(true);
    expect(isPresenceStale(null, NOW)).toBe(true);
    expect(isPresenceStale("not a date", NOW)).toBe(true);
  });

  it("ほかの人が担当していて、止まっていなければ「ほかの人の担当」", () => {
    const held = assignment({ holderId: "m2", holderName: "佐藤", heartbeatAt: ago(30 * 1000) });
    expect(isHeldByOther(held, "m1", NOW)).toBe(true);
    expect(isHeldByOther(held, "m2", NOW)).toBe(false);
    expect(isHeldByOther({ ...held, heartbeatAt: ago(5 * 60 * 1000) }, "m1", NOW)).toBe(false);
    expect(isHeldByOther(undefined, "m1", NOW)).toBe(false);
    expect(isHeldByOther(assignment(), "m1", NOW)).toBe(false);
  });
});

describe("始めてよいか(目安)", () => {
  const base = { hasVideo: true, rallyCount: 0, p0Done: false, p1Done: false, p1Progress: undefined };

  it("P0:動画の URL があれば始められる", () => {
    expect(passReadiness("P0", base)).toEqual({ ready: true, hint: null });
    expect(passReadiness("P0", { ...base, hasVideo: false }).ready).toBe(false);
  });

  it("P1:P0 が完了か、ラリーがあれば始められる", () => {
    expect(passReadiness("P1", base)).toEqual({ ready: false, hint: "P0 がまだ" });
    expect(passReadiness("P1", { ...base, rallyCount: 5 })).toEqual({ ready: true, hint: "P0 が途中" });
    expect(passReadiness("P1", { ...base, p0Done: true })).toEqual({ ready: true, hint: null });
  });

  it("P2〜P4:P1 が完了か、全部入れ終えていれば始められる。途中なら目安を出す", () => {
    expect(passReadiness("P2", base)).toEqual({ ready: false, hint: "P1 がまだ" });
    expect(passReadiness("P3", { ...base, p1Progress: { done: 3, total: 40, text: "" } })).toEqual({
      ready: true,
      hint: "P1 が途中(3/40)",
    });
    expect(passReadiness("P4", { ...base, p1Progress: { done: 40, total: 40, text: "" } })).toEqual({ ready: true, hint: null });
    expect(passReadiness("P4", { ...base, p1Done: true })).toEqual({ ready: true, hint: null });
  });
});

describe("マスの状態", () => {
  it("完了 > 担当・進みあり(作業中) > 未着手", () => {
    expect(cellStatus(undefined, { done: 0, total: 10, text: "" })).toBe("todo");
    expect(cellStatus(undefined, { done: 2, total: 10, text: "" })).toBe("working");
    expect(cellStatus(assignment({ holderId: "m1" }), undefined)).toBe("working");
    expect(cellStatus(assignment({ done: true, holderId: "m1" }), undefined)).toBe("done");
  });
});

describe("担当の表", () => {
  function setWithRallies(): IaSet {
    const set = createEmptySet(1);
    set.youtubeUrl = "https://youtu.be/abc";
    set.rallies = [
      { id: "r1", serveTime: 10, side: "near", status: "rally", source: "auto" },
      { id: "r2", serveTime: 30, side: null, status: "rally", source: "auto" },
    ];
    return set;
  }

  it("セットごとに P0〜P4 のマス。打たないセットは出さない", () => {
    const skipped = { ...createEmptySet(2), skipped: true };
    const rows = buildBoard(
      { sets: [setWithRallies(), skipped], extras: {} },
      [assignment({ pass: "P0", holderId: "m1", holderName: "林", heartbeatAt: ago(1000) })],
      [
        { setIndex: 1, pass: "P0", seconds: 60 },
        { setIndex: 1, pass: "P0", seconds: 30 },
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.map((cell) => cell.pass)).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    const p0 = rows[0].cells[0];
    expect(p0.status).toBe("working");
    expect(p0.stale).toBe(false);
    expect(p0.seconds).toBe(90);
    expect(p0.progress.text).toContain("未定1");
    // P0 が途中でもラリーがあるので、P1 は始められる
    expect(rows[0].cells[1].readiness).toEqual({ ready: true, hint: "P0 が途中" });
    expect(rows[0].cells[2].readiness.ready).toBe(false);
  });

  it("止まっている担当は stale", () => {
    const rows = buildBoard(
      { sets: [setWithRallies()], extras: {} },
      [assignment({ pass: "P1", holderId: "m2", holderName: "佐藤", heartbeatAt: ago(10 * 60 * 1000) })],
      [],
      NOW,
    );
    expect(rows[0].cells[1].stale).toBe(true);
    expect(rows[0].cells[1].status).toBe("working");
  });
});

describe("formatAgo", () => {
  it("今・分前・時間前", () => {
    expect(formatAgo(ago(10 * 1000), NOW)).toBe("今");
    expect(formatAgo(ago(3 * 60 * 1000), NOW)).toBe("3分前");
    expect(formatAgo(ago(2 * 60 * 60 * 1000), NOW)).toBe("2時間前");
    expect(formatAgo(null, NOW)).toBe("");
  });
});
