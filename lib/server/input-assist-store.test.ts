import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IaP0Data, IaP1Data } from "@/lib/domain/input-assist/collab";
import { createEmptySet, emptyTeam } from "@/lib/domain/input-assist/session";
import type { InputAssistSession } from "@/lib/domain/input-assist/types";

// 打ち込み補助の置き場所を、手元のデータベース(PGlite)と文書(.data/documents)で通しで確かめる。
// 一時フォルダで動かす(本物の .data には触らない)。

type Store = typeof import("@/lib/server/input-assist-store");

const TEAM = "utvb";
const LEGACY_ID = "0123456789abcdef01234567";
const A = { id: "m-a", displayName: "1林" };
const B = { id: "m-b", displayName: "2佐藤" };

let store: Store;
let originalCwd: string;
let dir: string;

function legacySession(): InputAssistSession {
  const set = createEmptySet(1);
  set.rallies = [
    {
      id: "r1",
      serveTime: 10,
      side: "near",
      status: "rally",
      source: "auto",
      plays: [{ id: "p1", team: "*", player: 5, skill: "S", effect: "-", effectSource: "manual" }],
      flowDone: true,
    },
  ];
  return {
    id: LEGACY_ID,
    teamSlug: TEAM,
    title: "前の形",
    date: "2026-11-01",
    opponent: "千葉大学",
    teams: { home: emptyTeam("東大"), away: emptyTeam("千葉大") },
    extras: {},
    sets: [set],
    passLogs: [{ id: "log1", setIndex: 1, pass: "P0", startedAt: "a", endedAt: "b", seconds: 42 }],
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

beforeAll(async () => {
  originalCwd = process.cwd();
  dir = await mkdtemp(path.join(os.tmpdir(), "ia-store-"));
  process.chdir(dir);
  vi.stubEnv("WORKSPACE_STORE_PROVIDER", "local");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("POSTGRES_URL", "");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  // 前の形の試合(1つの文書にすべて)を置いておく
  await mkdir(path.join(dir, ".data", "documents"), { recursive: true });
  await writeFile(
    path.join(dir, ".data", "documents", `input-assist-${TEAM}-${LEGACY_ID}.json`),
    JSON.stringify(legacySession()),
  );
  store = await import("@/lib/server/input-assist-store");
}, 60_000);

afterAll(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("input-assist-store(PGlite)", () => {
  it("前の形の試合は、はじめて開いたときにスライスに分ける(中身・パスの時間はそのまま)", async () => {
    const bundle = await store.loadInputAssistBundle(TEAM, LEGACY_ID);
    expect(bundle?.meta.storageVersion).toBe(2);
    expect(bundle?.meta.sets[0].rallies).toEqual([]);
    const p0 = bundle?.slices.find((slice) => slice.setIndex === 1 && slice.pass === "P0");
    expect((p0?.data as IaP0Data).rallies.map((rally) => rally.id)).toEqual(["r1"]);
    expect(bundle?.passSeconds).toEqual([{ setIndex: 1, pass: "P0", seconds: 42 }]);

    const session = await store.getInputAssistSession(TEAM, LEGACY_ID);
    expect(session?.sets[0].rallies[0].plays?.[0]).toMatchObject({ id: "p1", effect: "-", effectSource: "manual" });
    // もう一度開いても、二重にならない
    const again = await store.loadInputAssistBundle(TEAM, LEGACY_ID);
    expect(again?.slices.find((slice) => slice.pass === "P0")?.version).toBe(1);
    expect(again?.passSeconds).toEqual([{ setIndex: 1, pass: "P0", seconds: 42 }]);
  }, 60_000);

  it("別のスライスは同時に保存してもぶつからない。同じスライスは版が違えば 409", async () => {
    const p0: IaP0Data = { rallies: [{ id: "r1", serveTime: 10, side: "far", status: "rally", source: "auto" }], substitutions: [], timeouts: [] };
    const p1: IaP1Data = { rallies: { r1: { flowDone: true, plays: [{ id: "p1", team: "*", player: 7, skill: "S" }] } } };
    const [savedP0, savedP1] = await Promise.all([
      store.saveInputAssistSlice(TEAM, LEGACY_ID, 1, "P0", p0, 1, A),
      store.saveInputAssistSlice(TEAM, LEGACY_ID, 1, "P1", p1, 1, B),
    ]);
    expect(savedP0?.ok).toBe(true);
    expect(savedP1?.ok).toBe(true);

    const stale = await store.saveInputAssistSlice(TEAM, LEGACY_ID, 1, "P0", p0, 1, B);
    expect(stale?.ok).toBe(false);
    if (stale && !stale.ok) {
      expect(stale.current.version).toBe(2);
      expect(stale.current.updatedByName).toBe(A.displayName);
    }
    // まだないスライスは版 0 で作る。2回目の版 0 はぶつかる
    expect((await store.saveInputAssistSlice(TEAM, LEGACY_ID, 2, "P2", { plays: {} }, 0, A))?.ok).toBe(true);
    expect((await store.saveInputAssistSlice(TEAM, LEGACY_ID, 2, "P2", { plays: {} }, 0, B))?.ok).toBe(false);
  }, 60_000);

  it("4 秒ごとに見る:手元の版より新しいスライスだけ中身を返す", async () => {
    const state = await store.getInputAssistSyncState(TEAM, LEGACY_ID, new Map([
        ["1-P0", 2],
        ["1-P1", 1],
        ["1-P2", 1],
        ["1-P3", 1],
        ["1-P4", 1],
      ]), null);
    expect(state?.changed.map((slice) => `${slice.setIndex}-${slice.pass}`).sort()).toEqual(["1-P1", "2-P2"]);
    expect(state?.versions.length).toBeGreaterThanOrEqual(6);
  }, 60_000);

  it("担当:止まっていない人の担当は取れない(引き継ぐなら取れる)。完了で外れる", async () => {
    expect((await store.updateInputAssistAssignment(TEAM, LEGACY_ID, "claim", 1, "P1", A))?.ok).toBe(true);
    expect((await store.updateInputAssistAssignment(TEAM, LEGACY_ID, "claim", 1, "P1", B))?.ok).toBe(false);
    expect((await store.updateInputAssistAssignment(TEAM, LEGACY_ID, "heartbeat", 1, "P1", A))?.ok).toBe(true);
    expect((await store.updateInputAssistAssignment(TEAM, LEGACY_ID, "claim", 1, "P1", B, true))?.ok).toBe(true);
    // 引き継がれたので、A の「まだいる」は通らない
    expect((await store.updateInputAssistAssignment(TEAM, LEGACY_ID, "heartbeat", 1, "P1", A))?.ok).toBe(false);
    const done = await store.updateInputAssistAssignment(TEAM, LEGACY_ID, "done", 1, "P1", B);
    const cell = done?.assignments.find((entry) => entry.setIndex === 1 && entry.pass === "P1");
    expect(cell).toMatchObject({ done: true, holderId: null, doneByName: B.displayName });
    const reopened = await store.updateInputAssistAssignment(TEAM, LEGACY_ID, "reopen", 1, "P1", A);
    expect(reopened?.assignments.find((entry) => entry.pass === "P1")?.done).toBe(false);
  }, 60_000);

  it("新しい試合はスライスに分けて作り、メタの保存はラリーを消さない", async () => {
    const set = createEmptySet(1);
    set.rallies = [{ id: "r9", serveTime: 3, side: null, status: "rally", source: "manual" }];
    const meta = await store.createInputAssistSession(TEAM, { title: "新しい試合", date: "2026-11-10", sets: [set] }, A);
    const updated = await store.updateInputAssistMeta(
      TEAM,
      meta.id,
      { title: "名前を編集", sets: [{ ...set, rallies: [] }] },
      meta.updatedAt,
    );
    expect(updated?.title).toBe("名前を編集");
    const session = await store.getInputAssistSession(TEAM, meta.id);
    expect(session?.sets[0].rallies.map((rally) => rally.id)).toEqual(["r9"]);
    await expect(store.updateInputAssistMeta(TEAM, meta.id, { title: "古い" }, meta.updatedAt)).rejects.toThrow();

    const list = await store.listInputAssistSessions(TEAM);
    expect(list.find((entry) => entry.id === meta.id)?.rallyCount).toBe(1);

    const log = await store.appendInputAssistPassLog(TEAM, meta.id, { setIndex: 1, pass: "P2", seconds: 12 }, B);
    expect(log).toMatchObject({ pass: "P2", seconds: 12, memberId: B.id, memberName: B.displayName });
  }, 60_000);
});
