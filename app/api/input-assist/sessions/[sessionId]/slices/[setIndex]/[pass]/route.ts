import { NextRequest, NextResponse } from "next/server";
import { isPassName, normalizeSliceData } from "@/lib/domain/input-assist/collab";
import { authorizeInputAssist } from "@/lib/server/input-assist-auth";
import { saveInputAssistSlice } from "@/lib/server/input-assist-store";

type RouteContext = {
  params: Promise<{
    sessionId: string;
    setIndex: string;
    pass: string;
  }>;
};

// セット × パスの中身(スライス)を1つ保存する。expectedVersion が今の版と違えば 409 で今のスライスを返す
// (画面の側で、id ごとに合わせて保存し直す)。別のセット・別のパスの保存とはぶつからない。
export async function PUT(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const auth = await authorizeInputAssist(teamSlug);
  if (auth.error) {
    return auth.error;
  }
  const { sessionId, setIndex: rawSetIndex, pass } = await context.params;
  const setIndex = Number(rawSetIndex);
  if (!(Number.isInteger(setIndex) && setIndex >= 1 && setIndex <= 5) || !isPassName(pass)) {
    return NextResponse.json({ error: "セットかパスが違います。" }, { status: 400 });
  }
  const payload = (await request.json().catch(() => null)) as { expectedVersion?: unknown; data?: unknown } | null;
  const expectedVersion = Number(payload?.expectedVersion);
  const data = normalizeSliceData(pass, payload?.data);
  if (!data || !(Number.isInteger(expectedVersion) && expectedVersion >= 0)) {
    return NextResponse.json({ error: "中身が読めません。" }, { status: 400 });
  }
  try {
    const result = await saveInputAssistSlice(teamSlug, sessionId, setIndex, pass, data, expectedVersion, auth.member);
    if (!result) {
      return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: "ほかの人が先に保存しました。", slice: result.current }, { status: 409 });
    }
    return NextResponse.json({ slice: result.record });
  } catch (error) {
    console.error("[api/input-assist] slice save failed", error);
    return NextResponse.json({ error: "保存できませんでした。" }, { status: 500 });
  }
}
