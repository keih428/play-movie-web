import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

const DOCUMENT_DIR = path.resolve(process.cwd(), ".data", "documents");
const DOCUMENT_PREFIX = "documents/";

function isRunningOnVercel() {
  return process.env.VERCEL === "1";
}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function assertWritableDocumentStore() {
  if (isRunningOnVercel() && !hasBlobToken()) {
    throw new Error(
      "Vercel Blob の書き込みトークンが未設定です。Vercel の環境変数 `BLOB_READ_WRITE_TOKEN` を設定してください。",
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
  return (
    provider === "vercel-blob" ||
    (!provider && hasBlobToken())
  );
}

export async function readDocument<T>(key: string): Promise<T | null> {
  if (shouldUseBlob()) {
    const result = await list({ prefix: `${DOCUMENT_PREFIX}${key}.json` });
    const blob = result.blobs[0];
    if (!blob) {
      return null;
    }

    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  }

  await ensureDocumentDir();
  try {
    const raw = await readFile(getDocumentPath(key), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeDocument<T>(key: string, value: T): Promise<T> {
  if (shouldUseBlob()) {
    await put(`${DOCUMENT_PREFIX}${key}.json`, JSON.stringify(value, null, 2), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json; charset=utf-8",
      allowOverwrite: true,
    });
    return value;
  }

  assertWritableDocumentStore();
  await ensureDocumentDir();
  await writeFile(getDocumentPath(key), JSON.stringify(value, null, 2), "utf8");
  return value;
}
