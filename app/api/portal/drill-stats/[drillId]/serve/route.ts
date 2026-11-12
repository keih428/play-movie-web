import { NextRequest, NextResponse } from "next/server";
import { canRecordDrillStats } from "@/lib/domain/drill-stats";
import { isPortalTeam } from "@/lib/domain/portal";
import { isServeResult, parseServeSetup } from "@/lib/domain/serve-stats";
import { getDrill } from "@/lib/server/portal-drill-stat-store";
import { getMember } from "@/lib/server/portal-member-store";
import {
  addServeCount,
  getServeSetup,
  listServeCounts,
  saveServeSetup,
} from "@/lib/server/portal-serve-stat-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    drillId: string;
  }>;
};

// record: true なら、数えられる人(スタッフ)だけ。
async function getContext(request: NextRequest, context: RouteContext, record: boolean) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return { error: NextResponse.json({ error: "ログインしてください。" }, { status: 401 }) };
  }
  if (record && !canRecordDrillStats(current)) {
    return {
      error: NextResponse.json({ error: "集計を付けられるのは、スタッフだけです。" }, { status: 403 }),
    };
  }
  const { drillId } = await context.params;
  const drill = await getDrill(teamSlug, drillId);
  if (!drill || drill.kind !== "serving") {
    return { error: NextResponse.json({ error: "サーブのメニューが見つかりません。" }, { status: 404 }) };
  }
  return { teamSlug, drill };
}

// いまの数と打つ人(何人かで同時に数えるので、画面が2秒ごとに取りにくる。見るのは全員)。
export async function GET(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, false);
  if ("error" in found) {
    return found.error;
  }
  const [counts, { setup, savedAt }] = await Promise.all([
    listServeCounts(found.drill.id),
    getServeSetup(found.drill.id),
  ]);
  return NextResponse.json({ counts, setup, setupSavedAt: savedAt }, { headers: { "cache-control": "no-store" } });
}

// 打つ人を保存する(あとから保存したものが勝つ)。
export async function PUT(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, true);
  if ("error" in found) {
    return found.error;
  }
  const setup = parseServeSetup(await request.json().catch(() => null));
  if (!setup) {
    return NextResponse.json({ error: "打つ人の選び方が正しくありません。" }, { status: 400 });
  }
  const savedAt = await saveServeSetup(found.drill.id, setup);
  return NextResponse.json({ setup, setupSavedAt: savedAt });
}

// 1本数える。result はエース・効果・入った・ミスのどれか。delta: -1 なら取り消す。
export async function PATCH(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, true);
  if ("error" in found) {
    return found.error;
  }
  const payload = (await request.json().catch(() => null)) as {
    memberId?: unknown;
    result?: unknown;
    delta?: unknown;
  } | null;
  if (typeof payload?.memberId !== "string" || !isServeResult(payload.result)) {
    return NextResponse.json({ error: "数える項目が正しくありません。" }, { status: 400 });
  }
  const member = await getMember(payload.memberId);
  if (!member || member.teamSlug !== found.teamSlug) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }
  const saved = await addServeCount({
    drillId: found.drill.id,
    memberId: member.id,
    result: payload.result,
    delta: payload.delta === -1 ? -1 : 1,
  });
  return NextResponse.json(saved);
}
