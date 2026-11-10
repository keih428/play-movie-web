import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readScoutRosterFile, setsFromVsmMatch } from "@/lib/domain/input-assist/roster";
import type { ScoutFileNode } from "@/lib/domain/types";

// データライブラリから名簿を取る・「試合ビューアに保存」を、手元の文書(.data/documents)・ワークスペース・PGlite で確かめる。

type Roster = typeof import("@/lib/server/input-assist-roster");
type Settings = typeof import("@/lib/server/app-settings-store");
type Viewer = typeof import("@/lib/server/input-assist-match-viewer");
type Store = typeof import("@/lib/server/input-assist-store");
type Workspaces = typeof import("@/lib/server/workspace-store");

const TEAM = "utvb";
const sampleText = readFileSync(path.resolve(__dirname, "../../vsm/2026-06-24 UTVB-TIT.vsm"), "utf8");

let roster: Roster;
let settings: Settings;
let viewer: Viewer;
let store: Store;
let workspaces: Workspaces;
let originalCwd: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  process.chdir(await mkdtemp(path.join(os.tmpdir(), "ia-roster-")));
  vi.stubEnv("WORKSPACE_STORE_PROVIDER", "local");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("POSTGRES_URL", "");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  roster = await import("@/lib/server/input-assist-roster");
  settings = await import("@/lib/server/app-settings-store");
  viewer = await import("@/lib/server/input-assist-match-viewer");
  store = await import("@/lib/server/input-assist-store");
  workspaces = await import("@/lib/server/workspace-store");

  // ライブラリ:フォルダの中に vsm、一番上に vsdb と Excel。ほかのチームにも vsm
  const vsdb = JSON.stringify({
    teams: [
      { name: "東京大学", players: [{ shirtNumber: 1, lastName: "田中" }] },
      { name: "千葉大学", players: [{ shirtNumber: 7, lastName: "鈴木" }] },
    ],
    matches: [JSON.parse(sampleText)],
  });
  await settings.saveScoutFileRecord({ id: "vsdb1", fileName: "2027上半期.vsdb", extension: ".vsdb", text: vsdb, uploadedAt: "2026-11-01T00:00:00Z" }, TEAM);
  await settings.saveScoutFileRecord({ id: "vsm1", fileName: "tit.vsm", extension: ".vsm", text: sampleText, uploadedAt: "2026-11-01T00:00:00Z" }, TEAM);
  await settings.saveScoutFileRecord({ id: "other", fileName: "x.vsm", extension: ".vsm", text: sampleText, uploadedAt: "2026-11-01T00:00:00Z" }, "other-team");
  const root: ScoutFileNode[] = [
    { id: "f1", type: "folder", name: "練習試合", children: [{ id: "n1", type: "file", name: "東北学院工学部", fileId: "vsm1", extension: ".vsm" }] },
    { id: "n2", type: "file", name: "2027上半期", fileId: "vsdb1", extension: ".vsdb" },
    { id: "n3", type: "file", name: "集計", fileId: "xlsx1", extension: ".xlsx" },
  ];
  await settings.saveScoutFileLibrary({ root }, TEAM);
}, 60_000);

afterAll(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("打ち込み補助:データライブラリの名簿", () => {
  it("vsdb・vsm だけを、vsdb を先に(フォルダの並びつきで)出す", async () => {
    expect(await roster.listRosterFiles(TEAM)).toEqual([
      { fileId: "vsdb1", name: "2027上半期", folder: "", extension: ".vsdb" },
      { fileId: "vsm1", name: "東北学院工学部", folder: "練習試合", extension: ".vsm" },
    ]);
  });

  it("選んだファイルの試合・チームを読む(試合の中身 raw は渡さない)。ライブラリにないものは読まない", async () => {
    const view = await roster.readRosterFromLibrary(TEAM, "vsdb1");
    expect(view?.kind).toBe("vsdb");
    expect(view?.teams.map((team) => team.name)).toEqual(["東京大学", "千葉大学"]);
    expect(view?.matches).toHaveLength(1);
    expect(view?.matches[0]).not.toHaveProperty("raw");
    expect(view?.matches[0].sets.length).toBeGreaterThan(0);
    const vsm = await roster.readRosterFromLibrary(TEAM, "vsm1");
    expect(vsm?.kind).toBe("vsm");
    expect(await roster.readRosterFromLibrary(TEAM, "other")).toBeNull();
    expect(await roster.readRosterFromLibrary(TEAM, "xlsx1")).toBeNull();
  });
});

describe("打ち込み補助:試合ビューアに保存", () => {
  it("VSM をフォルダ「打ち込み補助」に入れ、ワークスペースを作る。2回目は同じものを新しくする", async () => {
    const match = readScoutRosterFile(sampleText, "sample.vsm").matches[0];
    const sets = setsFromVsmMatch(match.raw).map((set) => ({ ...set, youtubeUrl: `https://youtu.be/v${set.setIndex}` }));
    sets[0] = { ...sets[0], skipped: true };
    const meta = await store.createInputAssistSession(
      TEAM,
      { title: "東北学院工学部戦", date: "2026-06-24", opponent: "東北学院工学部", teams: match.teams, sets },
      { id: "m1", displayName: "T林" },
    );

    const first = await viewer.saveInputAssistToMatchViewer(TEAM, meta.id);
    expect(first?.created).toBe(true);
    expect(first?.meta?.matchViewer).toMatchObject({ workspaceId: first?.workspaceId, scoutFileId: first?.scoutFileId });

    const library = await settings.getScoutFileLibrary(TEAM);
    const folder = library.root.find((node) => node.name === viewer.MATCH_VIEWER_FOLDER_NAME);
    expect(folder?.children?.map((node) => [node.name, node.fileId])).toEqual([["20260624_東北学院工学部", first?.scoutFileId]]);
    const record = await settings.getScoutFileRecord(first!.scoutFileId, TEAM);
    expect(record?.fileName).toBe("20260624_東北学院工学部.vsm");
    expect(record?.parsedCollection?.matches[0].sets).toHaveLength(sets.length - 1);

    const workspace = await workspaces.getSavedWorkspace(first!.workspaceId);
    expect(workspace?.teamSlug).toBe(TEAM);
    expect(workspace?.name).toBe("2026-06-24 東北学院工学部戦");
    expect(workspace?.settings.setVideos?.map((entry) => [entry.setIndex, entry.youtubeUrl, entry.offsetMode])).toEqual(
      sets.slice(1).map((set, index) => [index + 1, set.youtubeUrl, "set"]),
    );

    // 2回目:同じ試合データ・ワークスペースを新しくする(名前を変えていれば残す)
    await workspaces.saveWorkspace({
      id: workspace!.id,
      name: "名前を編集",
      workspace: {
        collection: workspace!.collection,
        settings: { ...workspace!.settings, prerollSeconds: 2 },
        selectedMatchIndex: 0,
        teamName: workspace!.teamName,
        teamSlug: TEAM,
        savedAt: workspace!.savedAt,
      },
    });
    const second = await viewer.saveInputAssistToMatchViewer(TEAM, meta.id);
    expect(second).toMatchObject({ created: false, workspaceId: first!.workspaceId, scoutFileId: first!.scoutFileId });
    const again = await workspaces.getSavedWorkspace(first!.workspaceId);
    expect(again?.name).toBe("名前を編集");
    expect(again?.settings.prerollSeconds).toBe(2);
    const folderAgain = (await settings.getScoutFileLibrary(TEAM)).root.find((node) => node.name === viewer.MATCH_VIEWER_FOLDER_NAME);
    expect(folderAgain?.children).toHaveLength(1);
  }, 60_000);
});
