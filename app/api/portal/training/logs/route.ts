import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam } from "@/lib/domain/portal";
import { TRAINING_DAYS, buildLiftKindMap, type TrainingDay } from "@/lib/domain/training";
import { getCurrentMember } from "@/lib/server/portal-session";
import { getTrainingMenu, saveDayRecord } from "@/lib/server/portal-training-store";

const MAX_TEXT_LENGTH = 2000;
const MAX_WEIGHT_KG = 500;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT_LENGTH) : "";
}

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
    weekStart?: string;
    day?: string;
    weights?: Record<string, unknown>;
    memo?: unknown;
    request?: unknown;
  };

  const menu = await getTrainingMenu(teamSlug);
  if (!menu || !menu.weeks.some((week) => week.s === payload.weekStart)) {
    return NextResponse.json({ error: "その週はメニューにありません。" }, { status: 400 });
  }
  if (!TRAINING_DAYS.includes(payload.day as TrainingDay)) {
    return NextResponse.json({ error: "曜日が正しくありません。" }, { status: 400 });
  }

  const liftKinds = buildLiftKindMap(menu);
  const weights = [];
  for (const [exercise, raw] of Object.entries(payload.weights ?? {}).slice(0, 40)) {
    if (raw === null || raw === "") {
      continue;
    }
    const weightKg = Number(raw);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > MAX_WEIGHT_KG) {
      return NextResponse.json(
        { error: `「${exercise}」の重さが正しくありません。` },
        { status: 400 },
      );
    }
    weights.push({
      exercise: exercise.slice(0, 120),
      lift: liftKinds.get(exercise) ?? null,
      weightKg,
    });
  }

  await saveDayRecord({
    memberId: current.id,
    weekStart: payload.weekStart as string,
    day: payload.day as TrainingDay,
    weights,
    memo: readText(payload.memo),
    request: readText(payload.request),
  });
  return NextResponse.json({ ok: true });
}
