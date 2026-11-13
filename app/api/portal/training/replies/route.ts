import { NextRequest, NextResponse } from "next/server";
import { findMentionedIds, listThreadParticipantIds } from "@/lib/domain/mentions";
import { canAdminister, canReplyTrainingRequest, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamTrainingRecordsPath } from "@/lib/domain/team";
import { formatMonthDay, TRAINING_REPLY_MAX, TRAINING_REQUEST_LABEL } from "@/lib/domain/training";
import { listMembers } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { excerpt, getBaseUrl, notifyMembers } from "@/lib/server/portal-slack";
import { addReply, listSessionReplies } from "@/lib/server/portal-training-reply-store";
import { getSessionRequest } from "@/lib/server/portal-training-store";

// 「トレーニング担当へ」に返信する。書けるのは、トレーニング担当と、書いた本人と、このやりとりで @ で呼ばれた人
// (呼ばれた人は 2026-11-13 から)。付いたら、書いた本人とトレーニング担当(と、これまでに返信した人・呼ばれた人)に
// 知らせる。この返信で呼ばれた人には「呼ばれた」と知らせる。返信した本人には知らせない。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    memberId?: unknown;
    sessionDate?: unknown;
    body?: unknown;
  };
  const memberId = typeof payload.memberId === "string" ? payload.memberId : "";
  const sessionDate = typeof payload.sessionDate === "string" ? payload.sessionDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json({ error: "日付が正しくありません。" }, { status: 400 });
  }

  const members = await listMembers(teamSlug);
  const owner = members.find((member) => member.id === memberId);
  const requestText = owner ? await getSessionRequest(owner.id, sessionDate) : "";
  if (!owner || !requestText) {
    return NextResponse.json({ error: `「${TRAINING_REQUEST_LABEL}」が見つかりません。` }, { status: 404 });
  }
  // 知らせる相手は、この返信が入る前の顔ぶれで決める。
  const previous = await listSessionReplies(owner.id, sessionDate);
  const threadIds = listThreadParticipantIds(previous, members);
  if (!canReplyTrainingRequest(current, { ownerId: owner.id, participantIds: threadIds })) {
    return NextResponse.json(
      { error: "返信できるのは、トレーニング担当と書いた本人、ここで @ で呼ばれた人だけです。" },
      { status: 403 },
    );
  }
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, TRAINING_REPLY_MAX) : "";
  if (!body) {
    return NextResponse.json({ error: "返信を書いてください。" }, { status: 400 });
  }

  const mentionedIds = new Set(findMentionedIds(body, members));
  mentionedIds.delete(current.id);
  const participantIds = new Set([
    owner.id,
    ...members.filter((member) => canAdminister(member)).map((member) => member.id),
    ...threadIds,
  ]);
  participantIds.delete(current.id);
  // 呼ばれた人は「呼ばれた」の知らせだけにする(2通にならないように)。
  for (const memberId of mentionedIds) {
    participantIds.delete(memberId);
  }

  await addReply({ memberId: owner.id, sessionDate, authorId: current.id, body });

  const link = `${getBaseUrl(request)}${buildTeamTrainingRecordsPath(teamSlug)}?date=${sessionDate}#req-${owner.id}-${sessionDate}`;
  const whose = current.id === owner.id ? "自分の" : `${owner.displayName} の`;
  const tail = `\n> ${excerpt(body)}\n${link}`;
  await Promise.all([
    notifyMembers(
      members.filter((member) => participantIds.has(member.id)),
      `${current.displayName} が、${whose}${formatMonthDay(sessionDate)}の記録の「${TRAINING_REQUEST_LABEL}」に返信しました${tail}`,
    ),
    notifyMembers(
      members.filter((member) => mentionedIds.has(member.id)),
      `${current.displayName} が、${whose}${formatMonthDay(sessionDate)}の記録の「${TRAINING_REQUEST_LABEL}」で、あなたを呼んでいます(ここから返信できます)${tail}`,
    ),
  ]);

  return NextResponse.json({ replies: await listSessionReplies(owner.id, sessionDate) });
}
