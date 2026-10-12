import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam } from "@/lib/domain/portal";
import { MEASUREMENT_ITEMS, type MeasurementItem } from "@/lib/domain/training";
import { getCurrentMember } from "@/lib/server/portal-session";
import { getTodayInJapan, saveMeasurements } from "@/lib/server/portal-training-store";

const LIMITS: Record<MeasurementItem, [number, number]> = {
  bw: [30, 200],
  sq: [10, 500],
  dl: [10, 500],
  bp: [10, 500],
};

export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (!current.position) {
    return NextResponse.json({ error: "記録できるのはプレイヤーだけです。" }, { status: 403 });
  }

  const payload = (await request.json()) as {
    items?: Partial<Record<MeasurementItem, { value?: unknown; rm?: unknown }>>;
  };

  const items = [];
  for (const item of MEASUREMENT_ITEMS) {
    const entry = payload.items?.[item];
    if (!entry || entry.value === "" || entry.value === null || entry.value === undefined) {
      continue;
    }
    const value = Number(entry.value);
    const [min, max] = LIMITS[item];
    if (!Number.isFinite(value) || value < min || value > max) {
      return NextResponse.json({ error: "数字が正しくありません。" }, { status: 400 });
    }
    items.push({ item, value, rm: item === "bw" ? null : Number(entry.rm) === 1 ? 1 : 3 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "数字を1つ以上入れてください。" }, { status: 400 });
  }

  await saveMeasurements(current.id, getTodayInJapan(), items);
  return NextResponse.json({ ok: true });
}
