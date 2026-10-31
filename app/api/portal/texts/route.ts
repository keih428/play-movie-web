import { NextRequest, NextResponse } from "next/server";
import {
  PORTAL_TEXT_MAX_LENGTH,
  canEditPortalTexts,
  canEditTeamGoal,
  isPortalTeam,
  isPortalTextKey,
  isRoleManualKey,
} from "@/lib/domain/portal";
import { getCurrentMember } from "@/lib/server/portal-session";
import { savePortalText } from "@/lib/server/portal-text-store";

// ホームのチームの目標など、部内ページの文章を書き直す。
export async function PUT(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
  }
  const payload = (await request.json().catch(() => null)) as { key?: unknown; body?: unknown } | null;
  const key = payload?.key;
  const body = typeof payload?.body === "string" ? payload.body.trim() : null;
  if (!isPortalTextKey(key) || body === null) {
    return NextResponse.json({ error: "内容が読み取れませんでした。" }, { status: 400 });
  }
  // チームの目標は幹部だけ。役職ごとのマニュアルは部員のだれでも(2026-11-01 から)。
  // ほかのデータベース/マニュアルは、幹部・トレーニング担当・システム担当。
  const allowed = key === "goal" ? canEditTeamGoal(current) : isRoleManualKey(key) || canEditPortalTexts(current);
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          key === "goal"
            ? "チームの目標を書けるのは、幹部だけです。"
            : "編集できるのは、幹部・トレーニング担当・システム担当だけです。",
      },
      { status: 403 },
    );
  }
  if (body.length > PORTAL_TEXT_MAX_LENGTH) {
    return NextResponse.json({ error: `${PORTAL_TEXT_MAX_LENGTH}文字までにしてください。` }, { status: 400 });
  }

  await savePortalText(teamSlug, key, body, current.id);
  return NextResponse.json({ ok: true });
}
