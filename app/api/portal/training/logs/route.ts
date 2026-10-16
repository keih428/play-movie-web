import { NextRequest, NextResponse } from "next/server";
import { getMemberGroup, isPortalTeam, receivesTrainingNotices } from "@/lib/domain/portal";
import { buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import {
  TRAINING_DAYS,
  buildLiftKindMap,
  findProgramForWeek,
  type TrainingDay,
} from "@/lib/domain/training";
import { getCurrentMember } from "@/lib/server/portal-session";
import { listMembers } from "@/lib/server/portal-member-store";
import { excerpt, getBaseUrl, notifyMembers } from "@/lib/server/portal-slack";
import {
  getDayRequest,
  listTrainingPrograms,
  saveDayRecord,
} from "@/lib/server/portal-training-store";

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

  const program = findProgramForWeek(await listTrainingPrograms(teamSlug), payload.weekStart ?? "");
  if (!program) {
    return NextResponse.json({ error: "その週はメニューにありません。" }, { status: 400 });
  }
  if (!TRAINING_DAYS.includes(payload.day as TrainingDay)) {
    return NextResponse.json({ error: "曜日が正しくありません。" }, { status: 400 });
  }

  const liftKinds = buildLiftKindMap(program.menu);
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

  const weekStart = payload.weekStart as string;
  const day = payload.day as TrainingDay;
  const requestText = readText(payload.request);
  const previousRequest = await getDayRequest(current.id, weekStart, day);
  await saveDayRecord({
    memberId: current.id,
    weekStart,
    day,
    weights,
    memo: readText(payload.memo),
    request: requestText,
  });

  // 「リーダー・トレーニング担当へ」が新しく書かれたか変わったら、まとまりのリーダー(OP は OH のリーダー)と、
  // トレーニング担当に知らせる。同じ内容で保存し直しただけなら知らせない。
  if (requestText && requestText !== previousRequest) {
    const group = getMemberGroup(current.position);
    const recipients = (await listMembers(teamSlug)).filter(
      (member) =>
        member.id !== current.id &&
        (receivesTrainingNotices(member) ||
          (member.isLeader && getMemberGroup(member.position) === group)),
    );
    const week = program.menu.weeks.find((entry) => entry.s === weekStart);
    await notifyMembers(
      recipients,
      `${current.displayName} がトレーニング録に「リーダー・トレーニング担当へ」を書きました\n> ${excerpt(requestText)}\n${getBaseUrl(request)}${buildTeamTrainingRecordsPath(teamSlug)}?menu=${program.key}&week=${week?.k ?? ""}`,
    );
  }
  return NextResponse.json({ ok: true });
}
