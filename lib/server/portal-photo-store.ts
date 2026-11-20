import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { query } from "@/lib/server/portal-db";

// ノート・コメントに付けた写真(2026-11-20 から)。中身は Vercel Blob の private に置き(手元では .data/note-photos)、
// 開くときは /api/portal/photos/[id] を通す(ログインした部員だけが見られる)。どこに付いたかは notes / note_comments の photo_ids。
const LOCAL_DIR = path.resolve(process.cwd(), ".data", "note-photos");

function storesInBlob() {
  if (process.env.VERCEL === "1" && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("写真の保存には環境変数 `BLOB_READ_WRITE_TOKEN` が要ります。");
  }
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function savePhoto(input: {
  teamSlug: string;
  uploaderId: string;
  bytes: Buffer;
  contentType: string;
}): Promise<string> {
  const id = randomUUID();
  const pathname = `note-photos/${input.teamSlug}/${id}.${EXTENSIONS[input.contentType] ?? "bin"}`;
  if (storesInBlob()) {
    await put(pathname, input.bytes, {
      access: "private",
      addRandomSuffix: false,
      contentType: input.contentType,
    });
  } else {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, id), input.bytes);
  }
  await query(
    "INSERT INTO note_photos (id, team_slug, uploader_id, pathname, content_type) VALUES ($1, $2, $3, $4, $5)",
    [id, input.teamSlug, input.uploaderId, pathname, input.contentType],
  );
  return id;
}

export async function readPhoto(
  teamSlug: string,
  id: string,
): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null> {
  const rows = await query<{ pathname: string; content_type: string }>(
    "SELECT pathname, content_type FROM note_photos WHERE id = $1 AND team_slug = $2",
    [id, teamSlug],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (storesInBlob()) {
    const result = await get(row.pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }
    return { body: result.stream, contentType: row.content_type };
  }
  try {
    return { body: await readFile(path.join(LOCAL_DIR, id)), contentType: row.content_type };
  } catch {
    return null;
  }
}

/**
 * ノート・コメントに付けてよい写真だけを残す(並びはそのまま)。自分で上げた写真か、もうそこに付いている写真だけ
 * (ほかの人の写真の ID を書いて付けられないように)。
 */
export async function keepAllowedPhotoIds(
  teamSlug: string,
  uploaderId: string,
  ids: string[],
  alreadyAttached: string[] = [],
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await query<{ id: string }>(
    "SELECT id FROM note_photos WHERE team_slug = $1 AND id = ANY($2::text[]) AND (uploader_id = $3 OR id = ANY($4::text[]))",
    [teamSlug, ids, uploaderId, alreadyAttached],
  );
  const allowed = new Set(rows.map((row) => row.id));
  return ids.filter((id) => allowed.has(id));
}
