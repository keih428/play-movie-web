import { NextRequest, NextResponse } from "next/server";
import { canRecordDrillStats, isDrillGrade, isDrillSkill } from "@/lib/domain/drill-stats";
import { isPortalTeam } from "@/lib/domain/portal";
import { addDrillCount, deleteDrill, getDrill } from "@/lib/server/portal-drill-stat-store";
import { getMember } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    drillId: string;
  }>;
};

async function getContext(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return { error: NextResponse.json({ error: "ログインしてください。" }, { status: 401 }) };
  }
  if (!canRecordDrillStats(current)) {
    return {
      error: NextResponse.json({ error: "集計を付けられるのは、マネージャー・アナリストなどだけです。" }, { status: 403 }),
    };
  }
  const { drillId } = await context.params;
  const drill = await getDrill(teamSlug, drillId);
  if (!drill) {
    return { error: NextResponse.json({ error: "メニューが見つかりません。" }, { status: 404 }) };
  }
  return { teamSlug, drill };
}

// 1人の、1つの評価の本数を1つ増やす(delta: -1 なら減らす)。
export async function PATCH(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context);
  if ("error" in found) {
    return found.error;
  }

  const payload = (await request.json().catch(() => null)) as {
    memberId?: unknown;
    skill?: unknown;
    grade?: unknown;
    delta?: unknown;
  } | null;
  if (!isDrillSkill(payload?.skill) || !isDrillGrade(payload?.grade) || typeof payload?.memberId !== "string") {
    return NextResponse.json({ error: "数える項目が正しくありません。" }, { status: 400 });
  }
  const member = await getMember(payload.memberId);
  if (!member || member.teamSlug !== found.teamSlug) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }

  const count = await addDrillCount({
    drillId: found.drill.id,
    memberId: member.id,
    skill: payload.skill,
    grade: payload.grade,
    delta: payload.delta === -1 ? -1 : 1,
  });
  return NextResponse.json({ count });
}

// メニューを消す(本数も一緒に消える)。
export async function DELETE(request: NextRequest, context: RouteContext) {
  const found = await getContext(request, context);
  if ("error" in found) {
    return found.error;
  }
  await deleteDrill(found.teamSlug, found.drill.id);
  return NextResponse.json({ ok: true });
}
