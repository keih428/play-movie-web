import { NextRequest, NextResponse } from "next/server";
import {
  NOTE_BODY_MAX,
  NOTE_REQUEST_MAX,
  formatNoteDate,
  getLastNoteDate,
  isIsoDate,
} from "@/lib/domain/notes";
import { getMemberGroup, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamNotesPath } from "@/lib/domain/team";
import { getWeekDuties } from "@/lib/server/portal-comment-duty-store";
import { listMembers } from "@/lib/server/portal-member-store";
import { saveNote } from "@/lib/server/portal-note-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { excerpt, getBaseUrl, notifyMembers } from "@/lib/server/portal-slack";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

function readText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// 自分のノートを書く(その日のノートがもうあれば、書き直す)。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (!current.position) {
    return NextResponse.json({ error: "ノートを書けるのはプレイヤーだけです。" }, { status: 403 });
  }

  const payload = (await request.json()) as { date?: unknown; body?: unknown; request?: unknown };
  if (!isIsoDate(payload.date) || payload.date > getLastNoteDate(getTodayInJapan())) {
    return NextResponse.json({ error: "日付が正しくありません(書けるのは明日の分までです)。" }, { status: 400 });
  }
  const body = readText(payload.body, NOTE_BODY_MAX);
  if (!body) {
    return NextResponse.json({ error: "本文を書いてください。" }, { status: 400 });
  }

  const { note, requestChanged, created } = await saveNote({
    member: current,
    practiceDate: payload.date,
    body,
    request: readText(payload.request, NOTE_REQUEST_MAX),
  });

  // 「リーダーへ」が書かれたら、書いた人のまとまりのリーダーに知らせる(OP は OH のリーダー)。
  if (requestChanged) {
    const group = getMemberGroup(current.position);
    const leaders = (await listMembers(teamSlug)).filter(
      (member) =>
        member.isLeader && member.id !== current.id && getMemberGroup(member.position) === group,
    );
    await notifyMembers(
      leaders,
      `${current.displayName} が ${formatNoteDate(note.practiceDate)} のノートに「リーダーへ」を書きました\n> ${excerpt(note.request)}\n${getBaseUrl(request)}${buildTeamNotesPath(teamSlug)}/${note.id}`,
    );
  }

  // コメント当番:今週この人を受け持っている人に、新しいノートが書かれたことを知らせて、コメントを促す。
  // 書き直しでは知らせない。
  if (created) {
    try {
      const duty = (await getWeekDuties(teamSlug, getTodayInJapan())).find((pair) => pair.targetId === current.id);
      const commenter = duty ? (await listMembers(teamSlug)).find((member) => member.id === duty.commenterId) : null;
      if (commenter) {
        await notifyMembers(
          [commenter],
          `コメント当番:${current.displayName} が ${formatNoteDate(note.practiceDate)} のノートを書きました。今週はあなたの担当です。コメントしてください\n> ${excerpt(note.body)}\n${getBaseUrl(request)}${buildTeamNotesPath(teamSlug)}/${note.id}`,
        );
      }
    } catch (error) {
      // 当番の知らせが送れなくても、ノートの保存は成功として返す。
      console.error("[notes] comment duty notice", error);
    }
  }

  return NextResponse.json({ note });
}
