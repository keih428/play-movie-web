import { NextRequest, NextResponse } from "next/server";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { formatPeriod, getProgramRange, validateMenu, validatePlan } from "@/lib/domain/training";
import { getCurrentMember } from "@/lib/server/portal-session";
import {
  deleteTrainingProgram,
  saveTrainingPlan,
  saveTrainingProgram,
} from "@/lib/server/portal-training-store";

async function getAdministrator(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  return current && canAdminister(current.role) ? { teamSlug, current } : null;
}

// メニュー(menu.json)と年間の方針(plan.json)は、リポジトリに置かず、ここから読み込ませる。
// メニューは期間ごとに持つ:最初の週の開始日が同じものは入れ替え、違うものは足す。
export async function POST(request: NextRequest) {
  const administrator = await getAdministrator(request);
  if (!administrator) {
    return NextResponse.json({ error: "メニューを変える権限がありません。" }, { status: 403 });
  }
  const { teamSlug, current } = administrator;
  const body = (await request.json().catch(() => null)) as { kind?: string } | null;

  if (body?.kind === "plan") {
    const plan = validatePlan(body);
    if (!plan) {
      return NextResponse.json(
        { error: "年間の方針のデータとして読めませんでした。`build.py --json` で作った plan.json を選んでください。" },
        { status: 400 },
      );
    }
    await saveTrainingPlan(teamSlug, plan, current.name);
    return NextResponse.json({ kind: "plan", blocks: plan.blocks.length });
  }

  const menu = validateMenu(body);
  if (!menu) {
    return NextResponse.json(
      { error: "メニューのデータとして読めませんでした。`build.py --json` で作った menu.json か plan.json を選んでください。" },
      { status: 400 },
    );
  }
  await saveTrainingProgram(teamSlug, menu, current.name);
  const { start, end } = getProgramRange(menu);
  return NextResponse.json({ kind: "menu", label: formatPeriod(start, end), weeks: menu.weeks.length });
}

export async function DELETE(request: NextRequest) {
  const administrator = await getAdministrator(request);
  if (!administrator) {
    return NextResponse.json({ error: "メニューを変える権限がありません。" }, { status: 403 });
  }

  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!(await deleteTrainingProgram(administrator.teamSlug, key))) {
    return NextResponse.json({ error: "そのメニューは見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
