import crypto from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import type {
  PersistedWorkspace,
  SavedWorkspaceRecord,
  SavedWorkspaceSummary,
} from "@/lib/domain/types";
import { enrichWorkspaceSummary } from "@/lib/domain/summary";

const WORKSPACE_DIR = path.resolve(process.cwd(), ".data", "workspaces");
const WORKSPACE_PREFIX = "workspaces/";

function debugLog(message: string, detail?: Record<string, unknown>) {
  console.log("[workspace-store]", message, detail ?? {});
}

type WorkspaceStore = {
  deleteWorkspace: (id: string) => Promise<boolean>;
  getWorkspace: (id: string) => Promise<SavedWorkspaceRecord | null>;
  listWorkspaces: () => Promise<SavedWorkspaceSummary[]>;
  provider: "local" | "vercel-blob";
  saveWorkspace: (input: {
    id?: string;
    name?: string;
    workspace: PersistedWorkspace;
  }) => Promise<SavedWorkspaceRecord>;
};

function isRunningOnVercel() {
  return process.env.VERCEL === "1";
}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function wantsBlobProvider() {
  return process.env.WORKSPACE_STORE_PROVIDER === "vercel-blob";
}

function assertPersistentWorkspaceStore() {
  if ((isRunningOnVercel() || wantsBlobProvider()) && !hasBlobToken()) {
    debugLog("persistent store assertion failed", {
      vercel: isRunningOnVercel(),
      wantsBlobProvider: wantsBlobProvider(),
      hasBlobToken: hasBlobToken(),
    });
    throw new Error(
      "Vercel 本番ではワークスペース保存に Vercel Blob が必要です。環境変数 `BLOB_READ_WRITE_TOKEN` を設定してください。",
    );
  }
}

function normalizeSummary(record: SavedWorkspaceRecord): SavedWorkspaceSummary {
  return enrichWorkspaceSummary(record, {
    id: record.id,
    name: record.name,
    sourceType: record.collection.sourceType,
    matchCount: record.collection.matches.length,
    teamName: record.teamName,
    teamSlug: record.teamSlug,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

async function ensureWorkspaceDir() {
  await mkdir(WORKSPACE_DIR, { recursive: true });
}

function getWorkspacePath(id: string) {
  return path.join(WORKSPACE_DIR, `${id}.json`);
}

async function putWorkspace(pathname: string, body: string) {
  debugLog("put workspace start", {
    pathname,
    bytes: body.length,
  });
  try {
    await put(pathname, body, {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json; charset=utf-8",
      allowOverwrite: true,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot use private access on a public store")
    ) {
      debugLog("put workspace retry public", { pathname });
      await put(pathname, body, {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json; charset=utf-8",
        allowOverwrite: true,
      });
      debugLog("put workspace success public", { pathname });
      return;
    }

    debugLog("put workspace failed", {
      pathname,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  debugLog("put workspace success private", { pathname });
}

async function createLocalStore(): Promise<WorkspaceStore> {
  async function getWorkspace(id: string) {
    await ensureWorkspaceDir();
    try {
      const raw = await readFile(getWorkspacePath(id), "utf8");
      debugLog("local get workspace hit", { id, path: getWorkspacePath(id) });
      return JSON.parse(raw) as SavedWorkspaceRecord;
    } catch {
      debugLog("local get workspace miss", { id, path: getWorkspacePath(id) });
      return null;
    }
  }

  return {
    provider: "local",
    async listWorkspaces() {
      await ensureWorkspaceDir();
      const entries = await readdir(WORKSPACE_DIR, { withFileTypes: true });
      debugLog("local list workspaces", {
        dir: WORKSPACE_DIR,
        count: entries.length,
      });
      const summaries = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map(async (entry) => {
            const fullPath = path.join(WORKSPACE_DIR, entry.name);
            const raw = await readFile(fullPath, "utf8");
            return normalizeSummary(JSON.parse(raw) as SavedWorkspaceRecord);
          }),
      );

      return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    getWorkspace,
    async saveWorkspace(input) {
      await ensureWorkspaceDir();
      const now = new Date().toISOString();
      const existing = input.id ? await getWorkspace(input.id) : null;
      const id = existing?.id ?? input.id ?? crypto.randomUUID();
      const record: SavedWorkspaceRecord = {
        id,
        name: input.name?.trim() || existing?.name || "名称未設定の試合",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...input.workspace,
        savedAt: now,
      };

      await writeFile(getWorkspacePath(id), JSON.stringify(record, null, 2), "utf8");
      debugLog("local save workspace", {
        id,
        path: getWorkspacePath(id),
        name: record.name,
      });
      return record;
    },
    async deleteWorkspace(id: string) {
      await ensureWorkspaceDir();
      try {
        await rm(getWorkspacePath(id));
        debugLog("local delete workspace success", { id, path: getWorkspacePath(id) });
        return true;
      } catch {
        debugLog("local delete workspace miss", { id, path: getWorkspacePath(id) });
        return false;
      }
    },
  };
}

async function createBlobStore(): Promise<WorkspaceStore> {
  async function getWorkspace(id: string) {
    const pathname = `${WORKSPACE_PREFIX}${id}.json`;
    const result = await get(pathname, { access: "private" });
    debugLog("blob get workspace", {
      id,
      pathname,
      found: Boolean(result),
      statusCode: result?.statusCode ?? null,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    const raw = await new Response(result.stream).text();
    return JSON.parse(raw) as SavedWorkspaceRecord;
  }

  return {
    provider: "vercel-blob",
    async listWorkspaces() {
      const result = await list({ prefix: WORKSPACE_PREFIX });
      debugLog("blob list workspaces", {
        prefix: WORKSPACE_PREFIX,
        count: result.blobs.length,
      });
      const summaries = await Promise.all(
        result.blobs
          .filter((blob) => blob.pathname.endsWith(".json"))
          .map(async (blob) => {
            const entry = await get(blob.pathname, {
              access: "private",
            });
            debugLog("blob list workspace get", {
              pathname: blob.pathname,
              found: Boolean(entry),
              statusCode: entry?.statusCode ?? null,
            });
            if (!entry || entry.statusCode !== 200 || !entry.stream) {
              throw new Error(`failed to read workspace blob: ${blob.pathname}`);
            }
            const raw = await new Response(entry.stream).text();
            const record = JSON.parse(raw) as SavedWorkspaceRecord;
            return normalizeSummary(record);
          }),
      );

      return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    getWorkspace,
    async saveWorkspace(input) {
      const now = new Date().toISOString();
      const existing = input.id ? await getWorkspace(input.id) : null;
      const id = existing?.id ?? input.id ?? crypto.randomUUID();
      const record: SavedWorkspaceRecord = {
        id,
        name: input.name?.trim() || existing?.name || "名称未設定の試合",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...input.workspace,
        savedAt: now,
      };

      await putWorkspace(
        `${WORKSPACE_PREFIX}${id}.json`,
        JSON.stringify(record, null, 2),
      );
      debugLog("blob save workspace", {
        id,
        pathname: `${WORKSPACE_PREFIX}${id}.json`,
        name: record.name,
      });
      return record;
    },
    async deleteWorkspace(id: string) {
      const result = await list({ prefix: `${WORKSPACE_PREFIX}${id}.json` });
      const blob = result.blobs[0];
      debugLog("blob delete workspace lookup", {
        id,
        prefix: `${WORKSPACE_PREFIX}${id}.json`,
        count: result.blobs.length,
      });
      if (!blob) {
        return false;
      }

      await del(blob.url);
      debugLog("blob delete workspace success", { id, pathname: blob.pathname });
      return true;
    },
  };
}

let storePromise: Promise<WorkspaceStore> | undefined;

async function resolveStore(): Promise<WorkspaceStore> {
  const provider = process.env.WORKSPACE_STORE_PROVIDER;
  const useBlob = hasBlobToken() || wantsBlobProvider();

  debugLog("resolve store", {
    vercel: isRunningOnVercel(),
    envProvider: provider ?? null,
    hasBlobToken: hasBlobToken(),
    wantsBlobProvider: wantsBlobProvider(),
    useBlob,
  });

  if (useBlob) {
    assertPersistentWorkspaceStore();
    return createBlobStore();
  }

  assertPersistentWorkspaceStore();

  return createLocalStore();
}

async function getStore() {
  storePromise ??= resolveStore();
  return storePromise;
}

export async function getWorkspaceStoreProvider() {
  const store = await getStore();
  return store.provider;
}

export async function listSavedWorkspaces(): Promise<SavedWorkspaceSummary[]> {
  const store = await getStore();
  return store.listWorkspaces();
}

export async function getSavedWorkspace(
  id: string,
): Promise<SavedWorkspaceRecord | null> {
  const store = await getStore();
  return store.getWorkspace(id);
}

export async function saveWorkspace(input: {
  id?: string;
  name?: string;
  workspace: PersistedWorkspace;
}): Promise<SavedWorkspaceRecord> {
  const store = await getStore();
  return store.saveWorkspace(input);
}

export async function deleteSavedWorkspace(id: string): Promise<boolean> {
  const store = await getStore();
  return store.deleteWorkspace(id);
}
