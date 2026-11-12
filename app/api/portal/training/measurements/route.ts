import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam } from "@/lib/domain/portal";
import { MEASUREMENT_ITEMS, isEditableLogDate, type LiftKind, type MeasurementItem } from "@/lib/domain/training";
import { getCurrentMember } from "@/lib/server/portal-session";
import {
  deleteMeasurement,
  getTodayInJapan,
  hasMeasurement,
  saveMeasurements,
  updateMeasurement,
} from "@/lib/server/portal-training-store";

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
    // 測った日(2026-11-12 から。あとから入れられるように)。なければ今日。先の日付は入れられない。
    date?: unknown;
  };
  const today = getTodayInJapan();
  const date = payload.date === undefined || payload.date === "" ? today : payload.date;
  if (!isEditableLogDate(typeof date === "string" ? date : null, today) || (date as string) > today) {
    return NextResponse.json({ error: "測った日は、1年前から今日までで選んでください。" }, { status: 400 });
  }

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

  await saveMeasurements(current.id, date as string, items);
  return NextResponse.json({ ok: true });
}

// ---------- 自分の Big3 の記録を編集・削除する(2026-11-12 から。けーいちの依頼) ----------
// 日付を選べるようになる前の記録は、保存した日で入っている。測った日に直したり、間違いを消したりするため。
// 触れるのは自分の記録だけ(member_id はログインした人で決める)。体重はトレ録の記録から入るので、ここでは扱わない。

const LIFT_ITEMS: LiftKind[] = ["sq", "dl", "bp"];

function readLift(value: unknown): LiftKind | null {
  return LIFT_ITEMS.includes(value as LiftKind) ? (value as LiftKind) : null;
}

async function currentPlayer(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return { error: NextResponse.json({ error: "ログインが必要です。" }, { status: 401 }) };
  }
  return { current };
}

export async function PATCH(request: NextRequest) {
  const { current, error } = await currentPlayer(request);
  if (!current) {
    return error;
  }
  const payload = (await request.json()) as { item?: unknown; date?: unknown; newDate?: unknown; value?: unknown; rm?: unknown };
  const item = readLift(payload.item);
  const date = typeof payload.date === "string" ? payload.date : "";
  const newDate = typeof payload.newDate === "string" ? payload.newDate : "";
  if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "直す記録が見つかりません。" }, { status: 400 });
  }
  const today = getTodayInJapan();
  if (!isEditableLogDate(newDate, today) || newDate > today) {
    return NextResponse.json({ error: "測った日は、1年前から今日までで選んでください。" }, { status: 400 });
  }
  const value = Number(payload.value);
  const [min, max] = LIMITS[item];
  if (!Number.isFinite(value) || value < min || value > max) {
    return NextResponse.json({ error: "重さの数字が正しくありません。" }, { status: 400 });
  }
  if (newDate !== date && (await hasMeasurement(current.id, newDate, item))) {
    return NextResponse.json(
      { error: "その日には、もう同じ種目の記録があります。先にそちらを削除するか、そちらを編集してください。" },
      { status: 409 },
    );
  }
  const rm = Number(payload.rm) === 1 ? 1 : 3;
  if (!(await updateMeasurement(current.id, item, date, { measuredOn: newDate, value, rm }))) {
    return NextResponse.json({ error: "直す記録が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { current, error } = await currentPlayer(request);
  if (!current) {
    return error;
  }
  const payload = (await request.json()) as { item?: unknown; date?: unknown };
  const item = readLift(payload.item);
  const date = typeof payload.date === "string" ? payload.date : "";
  if (!item || !(await deleteMeasurement(current.id, item, date))) {
    return NextResponse.json({ error: "消す記録が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
