import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam, receivesTrainingNotices } from "@/lib/domain/portal";
import { buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import {
  SESSION_LIMITS,
  TRAINING_REQUEST_LABEL,
  addDays,
  compactExercises,
  type LiftKind,
  type SessionExercise,
  type SessionSet,
  inferLift,
} from "@/lib/domain/training";
import { listMembers } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { excerpt, getBaseUrl, notifyMembers } from "@/lib/server/portal-slack";
import {
  deleteSession,
  getSessionRequest,
  getTodayInJapan,
  saveMeasurements,
  saveSession,
} from "@/lib/server/portal-training-store";

const MAX_TEXT_LENGTH = 2000;
// 記録できる日:1年前から、明日まで(日付の打ち間違いを防ぐ)。
const MAX_PAST_DAYS = 366;
const LIFTS: LiftKind[] = ["sq", "dl", "bp"];

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT_LENGTH) : "";
}

function readNumber(value: unknown, max: number): number | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= max ? number : undefined;
}

function readDate(value: unknown, today: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value >= addDays(today, -MAX_PAST_DAYS) && value <= addDays(today, 1) ? value : null;
}

/** 送られてきた種目を確かめて、保存する形にする。おかしなところがあれば、その説明を返す。 */
function readExercises(raw: unknown): SessionExercise[] | string {
  if (!Array.isArray(raw) || raw.length > SESSION_LIMITS.exercises) {
    return "種目が多すぎます。";
  }
  const exercises: SessionExercise[] = [];
  for (const entry of raw as Record<string, unknown>[]) {
    const name = typeof entry?.name === "string" ? entry.name.trim().slice(0, SESSION_LIMITS.nameLength) : "";
    const lift = LIFTS.includes(entry?.lift as LiftKind) ? (entry.lift as LiftKind) : inferLift(name);
    const rawSets = Array.isArray(entry?.sets) ? (entry.sets as Record<string, unknown>[]) : [];
    if (rawSets.length > SESSION_LIMITS.setsPerExercise) {
      return `「${name}」のセットが多すぎます。`;
    }
    const sets: SessionSet[] = [];
    for (const set of rawSets) {
      const kg = readNumber(set?.kg, SESSION_LIMITS.maxKg);
      const reps = readNumber(set?.reps, SESSION_LIMITS.maxReps);
      if (kg === undefined || reps === undefined) {
        return `「${name || "名前のない種目"}」の重さか回数が正しくありません。`;
      }
      sets.push({ kg, reps: reps === null ? null : Math.round(reps) });
    }
    exercises.push({ name, lift, sets });
  }
  return compactExercises(exercises);
}

async function requirePlayer(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return { error: NextResponse.json({ error: "ログインが必要です。" }, { status: 401 }) };
  }
  if (!current.position) {
    return { error: NextResponse.json({ error: "記録できるのはプレイヤーだけです。" }, { status: 403 }) };
  }
  return { teamSlug, current };
}

// トレーニング録:1日ぶんの記録を保存する(同じ日の記録があれば置き換える)。
export async function POST(request: NextRequest) {
  const auth = await requirePlayer(request);
  if ("error" in auth) {
    return auth.error;
  }
  const { teamSlug, current } = auth;

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const date = readDate(payload?.date, getTodayInJapan());
  if (!date) {
    return NextResponse.json({ error: "日付が正しくありません(1年前から明日まで)。" }, { status: 400 });
  }
  const exercises = readExercises(payload?.exercises);
  if (typeof exercises === "string") {
    return NextResponse.json({ error: exercises }, { status: 400 });
  }
  const bodyWeightKg = readNumber(payload?.bodyWeightKg, 300);
  if (bodyWeightKg === undefined) {
    return NextResponse.json({ error: "体重が正しくありません。" }, { status: 400 });
  }
  const memo = readText(payload?.memo);
  const requestText = readText(payload?.request);
  if (exercises.length === 0 && bodyWeightKg === null && !memo && !requestText) {
    return NextResponse.json({ error: "重さ・回数か体重を、1つ以上入れてください。" }, { status: 400 });
  }

  const previousRequest = await getSessionRequest(current.id, date);
  await saveSession(current.id, { date, exercises, bodyWeightKg, memo, request: requestText });
  // 体重は測定の記録にも入れる(みんなの記録の体重比に使う)。
  if (bodyWeightKg !== null) {
    await saveMeasurements(current.id, date, [{ item: "bw", value: bodyWeightKg, rm: null }]);
  }

  // 「トレーニング担当へ」が新しく書かれたか変わったら、トレーニング担当にだけ知らせる。
  if (requestText && requestText !== previousRequest) {
    const recipients = (await listMembers(teamSlug)).filter(
      (member) => member.id !== current.id && receivesTrainingNotices(member),
    );
    await notifyMembers(
      recipients,
      `${current.displayName} がトレーニング録に「${TRAINING_REQUEST_LABEL}」を書きました\n> ${excerpt(requestText)}\n${getBaseUrl(request)}${buildTeamTrainingRecordsPath(teamSlug)}?date=${date}#req-${current.id}-${date}`,
    );
  }
  return NextResponse.json({ ok: true });
}

// その日の記録を消す。
export async function DELETE(request: NextRequest) {
  const auth = await requirePlayer(request);
  if ("error" in auth) {
    return auth.error;
  }
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "日付が正しくありません。" }, { status: 400 });
  }
  if (!(await deleteSession(auth.current.id, date))) {
    return NextResponse.json({ error: "その日の記録はありません。" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
