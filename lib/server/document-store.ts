import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

const DOCUMENT_DIR = path.resolve(process.cwd(), ".data", "documents");
const DOCUMENT_PREFIX = "documents/";

function debugLog(message: string, detail?: Record<string, unknown>) {
  console.log("[document-store]", message, detail ?? {});
}

function isRunningOnVercel() {
  return process.env.VERCEL === "1";
}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function wantsBlobProvider() {
  return process.env.WORKSPACE_STORE_PROVIDER === "vercel-blob";
}

function assertWritableDocumentStore() {
  if ((isRunningOnVercel() || wantsBlobProvider()) && !hasBlobToken()) {
    debugLog("writable store assertion failed", {
      vercel: isRunningOnVercel(),
      wantsBlobProvider: wantsBlobProvider(),
      hasBlobToken: hasBlobToken(),
    });
    throw new Error(
      "Vercel 本番ではドキュメント保存に Vercel Blob が必要です。環境変数 `BLOB_READ_WRITE_TOKEN` を設定してください。",
    );
  }
}

async function ensureDocumentDir() {
  await mkdir(DOCUMENT_DIR, { recursive: true });
}

function getDocumentPath(key: string) {
  return path.join(DOCUMENT_DIR, `${key}.json`);
}

function shouldUseBlob() {
  const provider = process.env.WORKSPACE_STORE_PROVIDER;
  const useBlob = hasBlobToken() || wantsBlobProvider();
  debugLog("resolve document store", {
    vercel: isRunningOnVercel(),
    envProvider: provider ?? null,
    hasBlobToken: hasBlobToken(),
    wantsBlobProvider: wantsBlobProvider(),
    useBlob,
  });
  return useBlob;
}

async function putDocument(pathname: string, body: string) {
  debugLog("put document start", {
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
      debugLog("put document retry public", { pathname });
      await put(pathname, body, {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json; charset=utf-8",
        allowOverwrite: true,
      });
      debugLog("put document success public", { pathname });
      return;
    }

    debugLog("put document failed", {
      pathname,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  debugLog("put document success private", { pathname });
}

export async function readDocument<T>(key: string): Promise<T | null> {
  assertWritableDocumentStore();

  if (shouldUseBlob()) {
    const result = await list({ prefix: `${DOCUMENT_PREFIX}${key}.json` });
    const blob = result.blobs[0];
    debugLog("blob read document list", {
      key,
      prefix: `${DOCUMENT_PREFIX}${key}.json`,
      count: result.blobs.length,
    });
    if (!blob) {
      return null;
    }

    const response = await fetch(blob.downloadUrl, { cache: "no-store" });
    debugLog("blob read document fetch", {
      key,
      pathname: blob.pathname,
      ok: response.ok,
      status: response.status,
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  }

  await ensureDocumentDir();
  try {
    const raw = await readFile(getDocumentPath(key), "utf8");
    debugLog("local read document hit", { key, path: getDocumentPath(key) });
    return JSON.parse(raw) as T;
  } catch {
    debugLog("local read document miss", { key, path: getDocumentPath(key) });
    return null;
  }
}

export async function writeDocument<T>(key: string, value: T): Promise<T> {
  assertWritableDocumentStore();

  if (shouldUseBlob()) {
    await putDocument(
      `${DOCUMENT_PREFIX}${key}.json`,
      JSON.stringify(value, null, 2),
    );
    debugLog("blob write document", {
      key,
      pathname: `${DOCUMENT_PREFIX}${key}.json`,
    });
    return value;
  }

  await ensureDocumentDir();
  await writeFile(getDocumentPath(key), JSON.stringify(value, null, 2), "utf8");
  debugLog("local write document", { key, path: getDocumentPath(key) });
  return value;
}
