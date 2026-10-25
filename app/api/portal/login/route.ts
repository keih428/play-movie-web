import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam, type LoginChoice } from "@/lib/domain/portal";
import { buildTeamTrainingPath } from "@/lib/domain/team";
import {
  LOCK_THRESHOLD,
  countRecentFailures,
  recordLogin,
  registerMemberDevice,
} from "@/lib/server/portal-login-log";
import { getMemberPassphraseHash, listMembers } from "@/lib/server/portal-member-store";
import { notifyAdmin } from "@/lib/server/portal-notify";
import { verifyMemberPassphrase } from "@/lib/server/portal-passphrase";
import {
  DEVICE_COOKIE,
  SESSION_COOKIE,
  createSessionValue,
  getCookieOptions,
  getRequestInfo,
  isCorrectPassphrase,
} from "@/lib/server/portal-session";

// 合言葉だけを送ると名簿(選ぶ用)が返り、名前も一緒に送るとログインする。
// 自分の合言葉を決めている人は、名前と一緒に自分の合言葉(memberPassphrase)も要る(2026-10-25 から)。
export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  if (!isPortalTeam(teamSlug)) {
    return NextResponse.json({ error: "このチームでは使えません。" }, { status: 404 });
  }

  const payload = (await request.json()) as {
    passphrase?: string;
    memberId?: string;
    memberPassphrase?: string;
  };
  const requestInfo = await getRequestInfo();
  const deviceId = request.cookies.get(DEVICE_COOKIE)?.value ?? randomUUID();

  const failures = await countRecentFailures(teamSlug, requestInfo.ip);
  if (failures >= LOCK_THRESHOLD) {
    await recordLogin({ teamSlug, result: "locked", deviceId, request: requestInfo });
    return NextResponse.json(
      { error: "合言葉を続けて間違えたため、しばらく試せません。15分ほど待ってください。" },
      { status: 429 },
    );
  }

  if (!isCorrectPassphrase(payload.passphrase ?? "")) {
    await recordLogin({ teamSlug, result: "bad_passphrase", deviceId, request: requestInfo });
    if (failures + 1 === LOCK_THRESHOLD) {
      await notifyAdmin(
        `部内ページ:合言葉を${LOCK_THRESHOLD}回続けて間違えたアクセスがありました(IP ${requestInfo.ip ?? "不明"})`,
      );
    }
    return NextResponse.json({ error: "合言葉が違います。" }, { status: 401 });
  }

  const members = await listMembers(teamSlug);
  if (!payload.memberId) {
    const choices: LoginChoice[] = members.map(({ id, displayName, grade, position, title, hasPassphrase }) => ({
      id,
      displayName,
      grade,
      position,
      title,
      hasPassphrase,
    }));
    return NextResponse.json({ members: choices });
  }

  const member = members.find((entry) => entry.id === payload.memberId);
  if (!member) {
    await recordLogin({ teamSlug, result: "unknown_member", deviceId, request: requestInfo });
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }

  const storedHash = await getMemberPassphraseHash(member.id);
  if (storedHash) {
    if (!payload.memberPassphrase) {
      return NextResponse.json({ error: "自分の合言葉を入れてください。" }, { status: 400 });
    }
    if (!(await verifyMemberPassphrase(payload.memberPassphrase, storedHash))) {
      await recordLogin({
        teamSlug,
        result: "bad_member_passphrase",
        memberId: member.id,
        memberName: member.displayName,
        deviceId,
        request: requestInfo,
      });
      if (failures + 1 === LOCK_THRESHOLD) {
        await notifyAdmin(
          `部内ページ:${member.displayName} の自分の合言葉を${LOCK_THRESHOLD}回続けて間違えたアクセスがありました(IP ${requestInfo.ip ?? "不明"})`,
        );
      }
      return NextResponse.json(
        { error: "自分の合言葉が違います。忘れたときは、システム担当に消してもらってください。" },
        { status: 401 },
      );
    }
  }

  const device = await registerMemberDevice(member.id, deviceId, requestInfo);
  await recordLogin({
    teamSlug,
    result: "ok",
    memberId: member.id,
    memberName: member.displayName,
    deviceId,
    newDevice: device.isNew,
    request: requestInfo,
  });
  // 初めてのログインは全員が「初めての端末」になるので、2台目からだけ知らせる。
  if (device.hadOtherDevices) {
    await notifyAdmin(
      `部内ページ:${member.displayName} が初めての端末からログインしました(IP ${requestInfo.ip ?? "不明"} / ${requestInfo.userAgent ?? "端末不明"})`,
    );
  }

  // まだ自分の合言葉を決めていない人には、ログインのあとで決めてもらう(あとにもできる)。
  const response = NextResponse.json({
    redirectTo: buildTeamTrainingPath(teamSlug),
    needsPassphraseSetup: !member.hasPassphrase,
  });
  response.cookies.set(SESSION_COOKIE, createSessionValue(member), getCookieOptions());
  response.cookies.set(DEVICE_COOKIE, deviceId, getCookieOptions());
  return response;
}
