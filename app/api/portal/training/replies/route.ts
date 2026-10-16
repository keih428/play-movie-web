import { NextRequest, NextResponse } from "next/server";
import { canAdminister, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import {
  TRAINING_DAYS,
  TRAINING_DAY_LABELS,
  TRAINING_REPLY_MAX,
  TRAINING_REQUEST_LABEL,
  findProgramForWeek,
  type TrainingDay,
} from "@/lib/domain/training";
import { listMembers } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { excerpt, getBaseUrl, notifyMembers } from "@/lib/server/portal-slack";
import { addReply, listDayReplies } from "@/lib/server/portal-training-reply-store";
import { getDayRequest, listTrainingPrograms } from "@/lib/server/portal-training-store";

// 「トレーニング担当へ」に返信する。書けるのは、トレーニング担当と、書いた本人。
// 付いたら、書いた本人とトレーニング担当(と、これまでに返信した人)に知らせる。返信した本人には知らせない。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    memberId?: unknown;
    weekStart?: unknown;
    day?: unknown;
    body?: unknown;
  };
  const memberId = typeof payload.memberId === "string" ? payload.memberId : "";
  const weekStart = typeof payload.weekStart === "string" ? payload.weekStart : "";
  const day = payload.day as TrainingDay;
  if (!TRAINING_DAYS.includes(day)) {
    return NextResponse.json({ error: "曜日が正しくありません。" }, { status: 400 });
  }
  if (memberId !== current.id && !canAdminister(current)) {
    return NextResponse.json(
      { error: "返信できるのは、トレーニング担当と書いた本人だけです。" },
      { status: 403 },
    );
  }

  const members = await listMembers(teamSlug);
  const owner = members.find((member) => member.id === memberId);
  const requestText = owner ? await getDayRequest(owner.id, weekStart, day) : "";
  if (!owner || !requestText) {
    return NextResponse.json({ error: `「${TRAINING_REQUEST_LABEL}」が見つかりません。` }, { status: 404 });
  }
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, TRAINING_REPLY_MAX) : "";
  if (!body) {
    return NextResponse.json({ error: "返信を書いてください。" }, { status: 400 });
  }

  // 知らせる相手は、この返信が入る前の顔ぶれで決める。
  const previous = await listDayReplies(owner.id, weekStart, day);
  const participantIds = new Set([
    owner.id,
    ...members.filter((member) => canAdminister(member)).map((member) => member.id),
    ...previous.map((reply) => reply.authorId),
  ]);
  participantIds.delete(current.id);

  await addReply({ memberId: owner.id, weekStart, day, authorId: current.id, body });

  const program = findProgramForWeek(await listTrainingPrograms(teamSlug), weekStart);
  const week = program?.menu.weeks.find((entry) => entry.s === weekStart);
  const link = `${getBaseUrl(request)}${buildTeamTrainingRecordsPath(teamSlug)}?menu=${program?.key ?? ""}&week=${week?.k ?? ""}#req-${owner.id}-${day}`;
  const whose = current.id === owner.id ? "自分の" : `${owner.displayName} の`;
  await notifyMembers(
    members.filter((member) => participantIds.has(member.id)),
    `${current.displayName} が、${whose}${TRAINING_DAY_LABELS[day]}の記録の「${TRAINING_REQUEST_LABEL}」に返信しました\n> ${excerpt(body)}\n${link}`,
  );

  return NextResponse.json({ replies: await listDayReplies(owner.id, weekStart, day) });
}
