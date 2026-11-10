import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { skeletonRallyId } from "@/lib/domain/input-assist/ai-job";
import type { IaP0Data } from "@/lib/domain/input-assist/collab";
import { createEmptySet, emptyTeam } from "@/lib/domain/input-assist/session";
import type { IaSet } from "@/lib/domain/input-assist/types";

// 「AI に骨組みを頼む」の依頼を、手元のデータベース(PGlite)と文書(.data/documents)で通しで確かめる。
// 一時フォルダで動かす(本物の .data には触らない)。

type Jobs = typeof import("@/lib/server/input-assist-ai-jobs");
type Store = typeof import("@/lib/server/input-assist-store");
type Db = typeof import("@/lib/server/portal-db");

const TEAM = "utvb";
const STAFF = { id: "m-staff", displayName: "T林" };

let jobs: Jobs;
let store: Store;
let db: Db;
let originalCwd: string;

function readySet(setIndex: number, patch: Partial<IaSet> = {}): IaSet {
  return { ...createEmptySet(setIndex), youtubeUrl: "https://youtu.be/abc", finalScore: { home: 25, away: 23 }, ...patch };
}

async function newSession(sets: IaSet[]) {
  return store.createInputAssistSession(
    TEAM,
    { title: "AI の試合", date: "2026-11-10", teams: { home: emptyTeam("東大"), away: emptyTeam("千葉大") }, sets },
    STAFF,
  );
}

/** ほかのテストの依頼が残らないように、待ち・解析中を片付ける。 */
async function clearQueue() {
  await db.query("UPDATE input_assist_ai_jobs SET status = 'failed' WHERE status IN ('pending', 'running')");
}

beforeAll(async () => {
  originalCwd = process.cwd();
  process.chdir(await mkdtemp(path.join(os.tmpdir(), "ia-ai-jobs-")));
  vi.stubEnv("WORKSPACE_STORE_PROVIDER", "local");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("POSTGRES_URL", "");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  store = await import("@/lib/server/input-assist-store");
  jobs = await import("@/lib/server/input-assist-ai-jobs");
  db = await import("@/lib/server/portal-db");
}, 60_000);

afterAll(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI の依頼(PGlite)", () => {
  it("準備が足りなければ頼めない。同じ試合の依頼が待ち・解析中なら、もう1つは作らない", async () => {
    const lacking = await newSession([readySet(1), readySet(2, { youtubeUrl: "" })]);
    expect(await jobs.createAiJob(TEAM, lacking.id, STAFF)).toMatchObject({ status: 400 });

    const meta = await newSession([readySet(1, { startTime: 12 }), readySet(2, { startTime: 1500 })]);
    const created = await jobs.createAiJob(TEAM, meta.id, STAFF);
    expect("job" in created && created.job).toMatchObject({ status: "pending", createdByName: STAFF.displayName });
    expect(await jobs.createAiJob(TEAM, meta.id, STAFF)).toMatchObject({ status: 409 });
    expect(await jobs.createAiJob(TEAM, "ffffffffffffffffffffffff", STAFF)).toMatchObject({ status: 404 });
    await clearQueue();
  }, 60_000);

  it("係は一番古い待ちを受け取る(同じものを2つの係に渡さない)。なければ null", async () => {
    const first = await newSession([readySet(1)]);
    const second = await newSession([readySet(1)]);
    const a = await jobs.createAiJob(TEAM, first.id, STAFF);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await jobs.createAiJob(TEAM, second.id, STAFF);
    const [claimA, claimB] = await Promise.all([jobs.claimAiJob(), jobs.claimAiJob()]);
    const claimed = [claimA, claimB].map((claim) => claim?.sessionId).sort();
    expect(claimed).toEqual([first.id, second.id].sort());
    expect(claimA?.jobId).toBe("job" in a ? a.job.id : "");
    expect(claimA).toMatchObject({
      teamSlug: TEAM,
      sets: [{ setIndex: 1, youtubeUrl: "https://youtu.be/abc", startSec: 0, endSec: null, finalScore: { home: 25, away: 23 }, nearTeam: "home", refereeHint: null }],
    });
    expect(await jobs.claimAiJob()).toBeNull();
    const list = await jobs.listAiJobs(TEAM, first.id);
    expect(list[0]).toMatchObject({ status: "running" });
    await clearQueue();
  }, 60_000);

  it("解析中のまま 30 分なにも送ってこなければ、受け取り直せる。進み具合を送れば延びる", async () => {
    const meta = await newSession([readySet(1)]);
    await jobs.createAiJob(TEAM, meta.id, STAFF);
    const t0 = new Date();
    const claim = await jobs.claimAiJob(t0);
    expect(claim).not.toBeNull();
    const jobId = claim!.jobId;
    expect(await jobs.claimAiJob(new Date(t0.getTime() + 29 * 60 * 1000))).toBeNull();

    expect(await jobs.reportAiJobProgress(jobId, { message: "動画を落としています", percent: 12.5 }, new Date(t0.getTime() + 20 * 60 * 1000))).toBe(true);
    // 進み具合を送ったので、受け取ってから 31 分でも、まだ受け取り直せない
    expect(await jobs.claimAiJob(new Date(t0.getTime() + 31 * 60 * 1000))).toBeNull();
    const [running] = await jobs.listAiJobs(TEAM, meta.id);
    expect(running).toMatchObject({ status: "running", progressMessage: "動画を落としています", progressPercent: 12.5 });

    const again = await jobs.claimAiJob(new Date(t0.getTime() + 51 * 60 * 1000));
    expect(again?.jobId).toBe(jobId);
    const rows = await db.query<{ attempts: number }>("SELECT attempts FROM input_assist_ai_jobs WHERE id = $1", [jobId]);
    expect(rows[0].attempts).toBe(2);
    await clearQueue();
  }, 60_000);

  it("骨組みが届いたら、ラリーが空のセットに自動で入れる。入っているセットは待たせる", async () => {
    const withRallies = readySet(2);
    withRallies.rallies = [{ id: "manual1", serveTime: 5, side: "near", status: "rally", source: "manual" }];
    const meta = await newSession([readySet(1), withRallies, readySet(3, { skipped: true })]);
    // 1セット目には交代だけ入っている(残す)
    await store.saveInputAssistSlice(
      TEAM,
      meta.id,
      1,
      "P0",
      { rallies: [], substitutions: [{ id: "sub1", time: 99, team: "home", playerIn: 3, playerOut: 4 }], timeouts: [] },
      1,
      STAFF,
    );
    await jobs.createAiJob(TEAM, meta.id, STAFF);
    const claim = (await jobs.claimAiJob())!;
    expect(claim.sets.map((set) => set.setIndex)).toEqual([1, 2]);

    // 形が違えば受け取らない
    expect(await jobs.completeAiJob(claim.jobId, { skeleton: { version: 2, rallies: [] } })).toMatchObject({ status: 400 });

    const skeleton = {
      version: 1,
      rallies: [
        { set: 1, serveTime: 40, side: "near", pSide: 0.95 },
        { set: 1, serveTime: 12.3, side: "far", pSide: 0.6 },
        { set: 2, serveTime: 1600, side: "near" },
        { set: 3, serveTime: 3000, side: "near" },
      ],
    };
    const done = await jobs.completeAiJob(claim.jobId, { skeleton, meta: { seconds: 1200, worker: "mac" } });
    expect(done).toEqual({ applied: { applied: [1], waiting: [2] } });

    const bundle = await store.loadInputAssistBundle(TEAM, meta.id);
    const p0 = (setIndex: number) =>
      bundle!.slices.find((slice) => slice.setIndex === setIndex && slice.pass === "P0")!;
    const set1 = p0(1).data as IaP0Data;
    expect(set1.rallies.map((rally) => [rally.serveTime, rally.side, rally.source])).toEqual([
      [12.3, "far", "auto"],
      [40, "near", "auto"],
    ]);
    expect(set1.rallies[0].id).toBe(skeletonRallyId(claim.jobId, 1, 0));
    expect(set1.substitutions.map((sub) => sub.id)).toEqual(["sub1"]);
    expect(p0(1).updatedByName).toBe("AI");
    expect((p0(2).data as IaP0Data).rallies.map((rally) => rally.id)).toEqual(["manual1"]);
    expect(bundle!.slices.find((slice) => slice.setIndex === 3 && slice.pass === "P0")?.data).toMatchObject({ rallies: [] });

    const [job] = await jobs.listAiJobs(TEAM, meta.id);
    expect(job).toMatchObject({ status: "done", applied: { applied: [1], waiting: [2] }, resultMeta: { seconds: 1200 } });
    expect(job.skeleton?.rallies).toHaveLength(4);
    // できたあとに、もう一度送っても受け取らない(進み具合・失敗も)
    expect(await jobs.completeAiJob(claim.jobId, { skeleton })).toMatchObject({ status: 409 });
    expect(await jobs.reportAiJobProgress(claim.jobId, { percent: 50 })).toBe(false);
    expect(await jobs.failAiJob(claim.jobId, "x")).toBe(false);
  }, 60_000);

  it("失敗を受け取ったら、理由を残す。そのあとは、また頼める", async () => {
    const meta = await newSession([readySet(1)]);
    await jobs.createAiJob(TEAM, meta.id, STAFF);
    const claim = (await jobs.claimAiJob())!;
    expect(await jobs.failAiJob(claim.jobId, "1セット目の YouTube の URL が読めない")).toBe(true);
    const [job] = await jobs.listAiJobs(TEAM, meta.id);
    expect(job).toMatchObject({ status: "failed", error: "1セット目の YouTube の URL が読めない" });
    expect(await jobs.failAiJob("not-an-id", "x")).toBe(false);
    expect("job" in (await jobs.createAiJob(TEAM, meta.id, STAFF))).toBe(true);
    await clearQueue();
  }, 60_000);

  describe("セットごとの途中の結果", () => {
    async function runningJob(sets: IaSet[]) {
      const meta = await newSession(sets);
      await jobs.createAiJob(TEAM, meta.id, STAFF);
      const claim = (await jobs.claimAiJob())!;
      expect(claim.sessionId).toBe(meta.id);
      return { meta, jobId: claim.jobId };
    }
    async function p0(sessionId: string, setIndex: number) {
      const bundle = await store.loadInputAssistBundle(TEAM, sessionId);
      return bundle!.slices.find((slice) => slice.setIndex === setIndex && slice.pass === "P0");
    }
    const set1 = { version: 1, rallies: [{ set: 1, serveTime: 40, side: "near" }, { set: 1, serveTime: 12, side: "far", pSide: 0.7 }] };
    const set2 = { version: 1, rallies: [{ set: 2, serveTime: 1600, side: "near" }] };

    it("届いたセットだけ、ラリーが空なら AI として入れる。期限も延びる。セットごとの状態が見える", async () => {
      const { meta, jobId } = await runningJob([readySet(1), readySet(2), readySet(3)]);
      const later = new Date(Date.now() + 25 * 60 * 1000);
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: set1 }, later)).toEqual({
        applied: { applied: [1], waiting: [] },
        sets: [1],
      });
      const slice = (await p0(meta.id, 1))!;
      expect((slice.data as IaP0Data).rallies.map((rally) => [rally.id, rally.serveTime, rally.source])).toEqual([
        [skeletonRallyId(jobId, 1, 0), 12, "auto"],
        [skeletonRallyId(jobId, 1, 1), 40, "auto"],
      ]);
      expect(slice.updatedByName).toBe("AI");
      expect((await p0(meta.id, 2))?.data).toMatchObject({ rallies: [] });
      // 期限が延びたので、受け取ってから 31 分では受け取り直せない
      expect(await jobs.claimAiJob(new Date(Date.now() + 31 * 60 * 1000))).toBeNull();

      const [job] = await jobs.listAiJobs(TEAM, meta.id);
      expect(job.status).toBe("running");
      expect(job.skeleton?.rallies).toHaveLength(2);
      expect(job.setStates).toEqual([
        { setIndex: 1, state: "applied", rallyCount: 2 },
        { setIndex: 2, state: "running", rallyCount: null },
        { setIndex: 3, state: "pending", rallyCount: null },
      ]);
      // 形が違う・ラリーがない・解析中でない依頼は受け取らない
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: { version: 2, rallies: [] } })).toMatchObject({ status: 400 });
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: { version: 1, rallies: [] } })).toMatchObject({ status: 400 });
      expect(await jobs.reportAiJobPartial("ffffffffffffffffffffffff", { skeleton: set1 })).toMatchObject({ status: 404 });
      await clearQueue();
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: set2 })).toMatchObject({ status: 409 });
    }, 60_000);

    it("同じ途中の結果をもう一度送っても、二重に入らず保存し直さない。違う中身なら、人の手が入っていない AI のラリーを入れ替える", async () => {
      const { meta, jobId } = await runningJob([readySet(1), readySet(2)]);
      await jobs.reportAiJobPartial(jobId, { skeleton: set1 });
      const before = (await p0(meta.id, 1))!;
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: set1 })).toEqual({ applied: { applied: [1], waiting: [] }, sets: [1] });
      const after = (await p0(meta.id, 1))!;
      expect(after.version).toBe(before.version);
      expect((after.data as IaP0Data).rallies).toHaveLength(2);

      // あとから届いた同じセットで入れ替える(まだ人の手が入っていない)
      const fixed = { version: 1, rallies: [{ set: 1, serveTime: 13, side: "far" }, { set: 1, serveTime: 41, side: "near" }, { set: 1, serveTime: 70, side: "near" }] };
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: fixed })).toMatchObject({ applied: { applied: [1], waiting: [] } });
      expect(((await p0(meta.id, 1))!.data as IaP0Data).rallies.map((rally) => rally.serveTime)).toEqual([13, 41, 70]);
      const [job] = await jobs.listAiJobs(TEAM, meta.id);
      expect(job.skeleton?.rallies.map((rally) => rally.serveTime)).toEqual([13, 41, 70]);
      await clearQueue();
    }, 60_000);

    it("ラリーが入っているセットの途中の結果は、入れずに入れ替え待ちにする", async () => {
      const withRallies = readySet(1);
      withRallies.rallies = [{ id: "manual1", serveTime: 5, side: "near", status: "rally", source: "manual" }];
      const { meta, jobId } = await runningJob([withRallies, readySet(2)]);
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: set1 })).toEqual({ applied: { applied: [], waiting: [1] }, sets: [1] });
      expect(((await p0(meta.id, 1))!.data as IaP0Data).rallies.map((rally) => rally.id)).toEqual(["manual1"]);
      // もう一度送っても、入れ替え待ちのまま
      expect(await jobs.reportAiJobPartial(jobId, { skeleton: set1 })).toMatchObject({ applied: { applied: [], waiting: [1] } });
      const [job] = await jobs.listAiJobs(TEAM, meta.id);
      expect(job.setStates.map((entry) => [entry.setIndex, entry.state])).toEqual([
        [1, "waiting"],
        [2, "running"],
      ]);
      await clearQueue();
    }, 60_000);

    it("途中の結果のあとに全部の結果が届いたら、入れたセットはそのまま、まだのセットだけ入れる", async () => {
      const { meta, jobId } = await runningJob([readySet(1), readySet(2), readySet(3)]);
      await jobs.reportAiJobPartial(jobId, { skeleton: set1 });
      const before = (await p0(meta.id, 1))!;
      // 1セット目は、人がもう打ち始めている(P1)。同じ中身なので触らない
      const p1 = (await store.loadInputAssistBundle(TEAM, meta.id))!.slices.find((slice) => slice.setIndex === 1 && slice.pass === "P1");
      const savedP1 = await store.saveInputAssistSlice(
        TEAM, meta.id, 1, "P1", { rallies: { [skeletonRallyId(jobId, 1, 0)]: { flowDone: true } } }, p1?.version ?? 0, STAFF,
      );
      expect(savedP1?.ok).toBe(true);
      const full = { version: 1, rallies: [...set1.rallies, ...set2.rallies, { set: 3, serveTime: 3000, side: "far" }] };
      expect(await jobs.completeAiJob(jobId, { skeleton: full, meta: { seconds: 900 } })).toEqual({
        applied: { applied: [1, 2, 3], waiting: [] },
      });
      const after = (await p0(meta.id, 1))!;
      expect(after.version).toBe(before.version);
      expect((after.data as IaP0Data).rallies).toHaveLength(2);
      expect(((await p0(meta.id, 2))!.data as IaP0Data).rallies.map((rally) => rally.id)).toEqual([skeletonRallyId(jobId, 2, 0)]);
      const [job] = await jobs.listAiJobs(TEAM, meta.id);
      expect(job).toMatchObject({ status: "done", applied: { applied: [1, 2, 3], waiting: [] } });
      expect(job.skeleton?.rallies).toHaveLength(4);
      expect(job.setStates.map((entry) => entry.state)).toEqual(["applied", "applied", "applied"]);
    }, 60_000);

    it("全部の結果に、途中の結果にあったセットがなくても残す", async () => {
      const { meta, jobId } = await runningJob([readySet(1), readySet(2)]);
      await jobs.reportAiJobPartial(jobId, { skeleton: set1 });
      expect(await jobs.completeAiJob(jobId, { skeleton: set2 })).toEqual({ applied: { applied: [1, 2], waiting: [] } });
      const [job] = await jobs.listAiJobs(TEAM, meta.id);
      expect(job.skeleton?.rallies.map((rally) => rally.set)).toEqual([1, 1, 2]);
    }, 60_000);
  });
});
