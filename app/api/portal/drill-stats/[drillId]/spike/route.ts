import { NextRequest, NextResponse } from "next/server";
import { canRecordDrillStats } from "@/lib/domain/drill-stats";
import { isPortalTeam } from "@/lib/domain/portal";
import { isSpikeSpot, normalizeSpikeLevel, parseSpikeSetup } from "@/lib/domain/spike-stats";
import { getDrill } from "@/lib/server/portal-drill-stat-store";
import { getMember } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import {
  addSpikeCount,
  getSpikeSetup,
  listSpikeCounts,
  saveSpikeSetup,
} from "@/lib/server/portal-spike-stat-store";

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
  if (!drill || drill.kind !== "spike") {
    return { error: NextResponse.json({ error: "スパイクのメニューが見つかりません。" }, { status: 404 }) };
  }
  return { teamSlug, drill };
}

// いまの本数と組み方(何人かで同時に数えるので、画面が2秒ごとに取りにくる。見るのは全員)。
export async function GET(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, false);
  if ("error" in found) {
    return found.error;
  }
  const [counts, { setup, savedAt }] = await Promise.all([
    listSpikeCounts(found.drill.id),
    getSpikeSetup(found.drill.id),
  ]);
  return NextResponse.json({ counts, setup, setupSavedAt: savedAt }, { headers: { "cache-control": "no-store" } });
}

// 組み方を保存する(前半・後半・セッター・サーブのレベル。あとから保存したものが勝つ)。
export async function PUT(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, true);
  if ("error" in found) {
    return found.error;
  }
  const setup = parseSpikeSetup(await request.json().catch(() => null));
  if (!setup) {
    return NextResponse.json({ error: "組み方が正しくありません。" }, { status: 400 });
  }
  const savedAt = await saveSpikeSetup(found.drill.id, setup);
  return NextResponse.json({ setup, setupSavedAt: savedAt });
}

// スパイクを1本数える(2026-11-06 から)。kill: true なら決定、false ならミス。delta: -1 なら取り消す。
export async function PATCH(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context, true);
  if ("error" in found) {
    return found.error;
  }
  const { teamSlug, drill } = found;

  const payload = (await request.json().catch(() => null)) as {
    memberId?: unknown;
    setterId?: unknown;
    spot?: unknown;
    level?: unknown;
    kill?: unknown;
    delta?: unknown;
  } | null;
  if (
    typeof payload?.memberId !== "string" ||
    typeof payload.setterId !== "string" ||
    !isSpikeSpot(payload.spot) ||
    typeof payload.kill !== "boolean"
  ) {
    return NextResponse.json({ error: "数える項目が正しくありません。" }, { status: 400 });
  }
  const level = normalizeSpikeLevel(payload.spot, payload.level);
  if (level === null) {
    return NextResponse.json({ error: "サーブのレベルを選んでください。" }, { status: 400 });
  }
  const [member, setter] = await Promise.all([getMember(payload.memberId), getMember(payload.setterId)]);
  if (!member || member.teamSlug !== teamSlug || !setter || setter.teamSlug !== teamSlug) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }

  const saved = await addSpikeCount({
    drillId: drill.id,
    memberId: member.id,
    setterId: setter.id,
    spot: payload.spot,
    level,
    kill: payload.kill,
    delta: payload.delta === -1 ? -1 : 1,
  });
  return NextResponse.json(saved);
}
