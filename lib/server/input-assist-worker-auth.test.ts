import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeWorker, checkWorkerToken, safeEqual } from "@/lib/server/input-assist-worker-auth";

describe("AI の係の合言葉", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Bearer の合言葉が同じときだけ通す", () => {
    expect(checkWorkerToken("Bearer s3cret", "s3cret")).toEqual({ ok: true });
    expect(checkWorkerToken("bearer   s3cret ", "s3cret")).toEqual({ ok: true });
    expect(checkWorkerToken("Bearer s3cre", "s3cret")).toMatchObject({ ok: false, status: 401 });
    expect(checkWorkerToken("Bearer s3cret2", "s3cret")).toMatchObject({ ok: false, status: 401 });
    expect(checkWorkerToken("s3cret", "s3cret")).toMatchObject({ ok: false, status: 401 });
    expect(checkWorkerToken(null, "s3cret")).toMatchObject({ ok: false, status: 401 });
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("サーバーに合言葉がなければ 503(分かる理由つき)", async () => {
    vi.stubEnv("INPUT_ASSIST_WORKER_TOKEN", "");
    const response = authorizeWorker(new Request("http://x/api", { headers: { Authorization: "Bearer anything" } }));
    expect(response?.status).toBe(503);
    expect((await response?.json()).error).toContain("INPUT_ASSIST_WORKER_TOKEN");
  });

  it("環境変数の合言葉で確かめる", async () => {
    vi.stubEnv("INPUT_ASSIST_WORKER_TOKEN", "tok");
    expect(authorizeWorker(new Request("http://x/api", { headers: { Authorization: "Bearer tok" } }))).toBeNull();
    const denied = authorizeWorker(new Request("http://x/api", { headers: { Authorization: "Bearer nope" } }));
    expect(denied?.status).toBe(401);
  });
});
