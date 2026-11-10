import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// 「AI に骨組みを頼む」の係(Mac・Wisteria)の確かめ方。部内ポータルのログインではなく、
// Authorization: Bearer <INPUT_ASSIST_WORKER_TOKEN>(Vercel の環境変数と、係の Mac に同じ値)で確かめる。

export type WorkerAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

/** 長さが違っても、かかる時間が変わらないように比べる(どちらもハッシュにしてから比べる)。 */
export function safeEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b) && left.length === right.length;
}

export function checkWorkerToken(authorization: string | null, expected: string | undefined): WorkerAuthResult {
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "係の合言葉(環境変数 INPUT_ASSIST_WORKER_TOKEN)がサーバーにありません。Vercel に設定してください。",
    };
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  if (!match || !safeEqual(match[1].trim(), expected)) {
    return { ok: false, status: 401, error: "係の合言葉が違います。" };
  }
  return { ok: true };
}

/** API 用。だめならそのレスポンス、よければ null。 */
export function authorizeWorker(request: Request): NextResponse | null {
  const result = checkWorkerToken(request.headers.get("authorization"), process.env.INPUT_ASSIST_WORKER_TOKEN);
  return result.ok ? null : NextResponse.json({ error: result.error }, { status: result.status });
}
