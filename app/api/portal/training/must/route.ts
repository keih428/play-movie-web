import { NextRequest, NextResponse } from "next/server";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { getCurrentMember } from "@/lib/server/portal-session";
import { listMustItems, setMustItem } from "@/lib/server/portal-training-must-store";

// 種目の星を付ける・外す(トレーニング担当だけ)。{ name, marked }。返すのは付いている種目の一覧。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current || !canAdminister(current)) {
    return NextResponse.json({ error: "星を付けられるのはトレーニング担当だけです。" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { name?: unknown; marked?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200 || typeof body?.marked !== "boolean") {
    return NextResponse.json({ error: "種目の名前が読めませんでした。" }, { status: 400 });
  }

  await setMustItem(teamSlug, name, body.marked, current.id);
  return NextResponse.json({ names: await listMustItems(teamSlug) });
}
