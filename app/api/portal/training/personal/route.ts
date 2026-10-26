import { NextRequest, NextResponse } from "next/server";
import { PERSONAL_ITEM_LIMITS, normalizePersonalDays } from "@/lib/domain/personal-items";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { getMember } from "@/lib/server/portal-member-store";
import {
  addPersonalItem,
  countPersonalItems,
  deletePersonalItem,
  listPersonalItems,
} from "@/lib/server/portal-personal-items-store";
import { getCurrentMember } from "@/lib/server/portal-session";

// 個人の追加メニュー(2026-10-26 から)。GET は本人かトレーニング担当、POST・DELETE はトレーニング担当だけ。
// どれも、その人の種目の一覧を返す。

async function getContext(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  return current ? { teamSlug, current } : null;
}

const text = (value: unknown, limit: number) => (typeof value === "string" ? value.trim().slice(0, limit) : "");

export async function GET(request: NextRequest) {
  const context = await getContext(request);
  if (!context) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  const memberId = request.nextUrl.searchParams.get("member") ?? context.current.id;
  if (memberId !== context.current.id && !canAdminister(context.current)) {
    return NextResponse.json({ error: "見られるのは自分の分だけです。" }, { status: 403 });
  }
  return NextResponse.json({ items: await listPersonalItems(context.teamSlug, memberId) });
}

export async function POST(request: NextRequest) {
  const context = await getContext(request);
  if (!context || !canAdminister(context.current)) {
    return NextResponse.json({ error: "足せるのはトレーニング担当だけです。" }, { status: 403 });
  }
  const { teamSlug, current } = context;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  const member = memberId ? await getMember(memberId) : null;
  if (!member || member.teamSlug !== teamSlug || !member.active) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }

  const name = text(body?.name, PERSONAL_ITEM_LIMITS.name);
  const days = normalizePersonalDays(body?.days);
  if (!name) {
    return NextResponse.json({ error: "種目の名前を入れてください。" }, { status: 400 });
  }
  if (days.length === 0) {
    return NextResponse.json({ error: "やる曜日を1つ以上選んでください。" }, { status: 400 });
  }
  if ((await countPersonalItems(teamSlug, memberId)) >= PERSONAL_ITEM_LIMITS.perMember) {
    return NextResponse.json(
      { error: `1人に足せるのは${PERSONAL_ITEM_LIMITS.perMember}種目までです。古いものを消してください。` },
      { status: 400 },
    );
  }

  await addPersonalItem(
    teamSlug,
    memberId,
    {
      name,
      dose: text(body?.dose, PERSONAL_ITEM_LIMITS.dose),
      tip: text(body?.tip, PERSONAL_ITEM_LIMITS.tip),
      days,
      weighted: body?.weighted === true,
    },
    current.id,
  );
  return NextResponse.json({ items: await listPersonalItems(teamSlug, memberId) });
}

export async function DELETE(request: NextRequest) {
  const context = await getContext(request);
  if (!context || !canAdminister(context.current)) {
    return NextResponse.json({ error: "消せるのはトレーニング担当だけです。" }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const memberId = await deletePersonalItem(context.teamSlug, id);
  if (!memberId) {
    return NextResponse.json({ error: "見つかりません(もう消えているかもしれません)。" }, { status: 404 });
  }
  return NextResponse.json({ items: await listPersonalItems(context.teamSlug, memberId) });
}
