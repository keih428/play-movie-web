import { NextRequest, NextResponse } from "next/server";
import { canRecordDrillStats } from "@/lib/domain/drill-stats";
import { isPortalTeam } from "@/lib/domain/portal";
import { parseReceptionSetup } from "@/lib/domain/reception-stats";
import { getDrill } from "@/lib/server/portal-drill-stat-store";
import { getMember } from "@/lib/server/portal-member-store";
import {
  addReceptionCount,
  getReceptionSetup,
  listReceptionCounts,
  saveReceptionSetup,
} from "@/lib/server/portal-reception-stat-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    drillId: string;
  }>;
};

// record: true なら、数えられる人(マネージャーなど)だけ。
async function getContext(request: NextRequest, context: RouteContext, record: boolean) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return { error: NextResponse.json({ error: "ログインしてください。" }, { status: 401 }) };
  }
  if (record && !canRecordDrillStats(current)) {
    return {
      error: NextResponse.json({ error: "集計を付けられるのは、マネージャー・アナリストなどだけです。" }, { status: 403 }),
    };
  }
  const { drillId } = await context.params;
  const drill = await getDrill(teamSlug, drillId);
  if (!drill || drill.kind !== "reception") {
    return { error: NextResponse.json({ error: "レセプションのメニューが見つかりません。" }, { status: 404 }) };
  }
  return { teamSlug, drill };
}

// いまの数と受ける人(何人かで同時に数えるので、画面が2秒ごとに取りにくる。見るのは全員)。
export async function GET(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, false);
  if ("error" in found) {
    return found.error;
  }
  const [counts, { setup, savedAt }] = await Promise.all([
    listReceptionCounts(found.drill.id),
    getReceptionSetup(found.drill.id),
  ]);
  return NextResponse.json({ counts, setup, setupSavedAt: savedAt }, { headers: { "cache-control": "no-store" } });
}

// 受ける人を保存する(あとから保存したものが勝つ)。
export async function PUT(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, true);
  if ("error" in found) {
    return found.error;
  }
  const setup = parseReceptionSetup(await request.json().catch(() => null));
  if (!setup) {
    return NextResponse.json({ error: "受ける人の選び方が正しくありません。" }, { status: 400 });
  }
  const savedAt = await saveReceptionSetup(found.drill.id, setup);
  return NextResponse.json({ setup, setupSavedAt: savedAt });
}

// 1本数える。pass: true なら ABパス、false ならそれ以外。delta: -1 なら取り消す。
export async function PATCH(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, true);
  if ("error" in found) {
    return found.error;
  }
  const payload = (await request.json().catch(() => null)) as {
    memberId?: unknown;
    pass?: unknown;
    delta?: unknown;
  } | null;
  if (typeof payload?.memberId !== "string" || typeof payload.pass !== "boolean") {
    return NextResponse.json({ error: "数える項目が正しくありません。" }, { status: 400 });
  }
  const member = await getMember(payload.memberId);
  if (!member || member.teamSlug !== found.teamSlug) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }
  const saved = await addReceptionCount({
    drillId: found.drill.id,
    memberId: member.id,
    pass: payload.pass,
    delta: payload.delta === -1 ? -1 : 1,
  });
  return NextResponse.json(saved);
}
