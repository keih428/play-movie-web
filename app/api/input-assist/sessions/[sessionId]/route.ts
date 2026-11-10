import { NextRequest, NextResponse } from "next/server";
import { IA_STORAGE_VERSION } from "@/lib/domain/input-assist/collab";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import {
  InputAssistConflictError,
  loadInputAssistBundle,
  updateInputAssistMeta,
  validateSessionInput,
  type InputAssistSessionInput,
} from "@/lib/server/input-assist-store";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

// 1試合の中身(メタ・スライス・担当・パスの時間)。前の形の試合は、ここではじめて開いたときにスライスに分ける。
export async function GET(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  const bundle = await loadInputAssistBundle(teamSlug, sessionId);
  if (!bundle) {
    return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ bundle });
}

// メタ(名前・日付・チーム・セットの準備)の保存。ラリーやタッチはスライスで保存する(slices/[setIndex]/[pass])。
// expectedUpdatedAt が今の保存と違えば、ほかの画面が先に保存したので 409 で今のメタを返す。
export async function PUT(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId } = await context.params;
  const payload = (await request.json().catch(() => null)) as
    | (InputAssistSessionInput & { expectedUpdatedAt?: unknown; storageVersion?: unknown })
    | null;
  if (!payload) {
    return NextResponse.json({ error: "中身が読めません。" }, { status: 400 });
  }
  // 前の画面(セッションをまるごと保存していたもの)からの保存は受け取らない(ラリーが消えないように)
  if (payload.storageVersion !== IA_STORAGE_VERSION) {
    return NextResponse.json(
      { error: "打ち込み補助が新しくなりました。ページを読み込み直してください。", reload: true },
      { status: 409 },
    );
  }
  const problem = validateSessionInput(payload, true);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }
  try {
    const meta = await updateInputAssistMeta(
      teamSlug,
      sessionId,
      payload,
      typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : undefined,
    );
    if (!meta) {
      return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ meta });
  } catch (error) {
    if (error instanceof InputAssistConflictError) {
      return NextResponse.json({ error: error.message, meta: error.current }, { status: 409 });
    }
    console.error("[api/input-assist] update failed", error);
    return NextResponse.json({ error: "保存できませんでした。" }, { status: 500 });
  }
}
