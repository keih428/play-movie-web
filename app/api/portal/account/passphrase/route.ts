import { NextRequest, NextResponse } from "next/server";
import { isPortalTeam, validateMemberPassphrase } from "@/lib/domain/portal";
import { getMemberPassphraseHash, setMemberPassphraseHash } from "@/lib/server/portal-member-store";
import { hashMemberPassphrase, verifyMemberPassphrase } from "@/lib/server/portal-passphrase";
import {
  SESSION_COOKIE,
  createSessionValue,
  getCookieOptions,
  getCurrentMember,
} from "@/lib/server/portal-session";

// 自分の合言葉を決める・決め直す(POST)、消す(DELETE)。2026-10-25 から。
// どちらも、もう決めている人は今の合言葉が要る(ログインしたままの端末を、ほかの人に使われたときのため)。
// 変えるとその人のほかの端末はログインし直しになる。この端末は、新しいクッキーに入れ替えてログインのまま。

type Payload = { current?: string; next?: string };

async function checkCurrent(memberId: string, current: string | undefined) {
  const stored = await getMemberPassphraseHash(memberId);
  if (!stored) {
    return null;
  }
  if (!current) {
    return "今の合言葉を入れてください。";
  }
  return (await verifyMemberPassphrase(current, stored)) ? null : "今の合言葉が違います。";
}

export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const member = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!member) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const payload = (await request.json()) as Payload;
  const next = payload.next ?? "";
  const invalid = validateMemberPassphrase(next);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }
  const wrong = await checkCurrent(member.id, payload.current);
  if (wrong) {
    return NextResponse.json({ error: wrong }, { status: 401 });
  }

  const updated = await setMemberPassphraseHash(teamSlug, member.id, await hashMemberPassphrase(next));
  if (!updated) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }
  const response = NextResponse.json({ hasPassphrase: true });
  response.cookies.set(SESSION_COOKIE, createSessionValue(updated), getCookieOptions());
  return response;
}

export async function DELETE(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const member = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!member) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const wrong = await checkCurrent(member.id, payload.current);
  if (wrong) {
    return NextResponse.json({ error: wrong }, { status: 401 });
  }

  const updated = await setMemberPassphraseHash(teamSlug, member.id, null);
  if (!updated) {
    return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
  }
  const response = NextResponse.json({ hasPassphrase: false });
  response.cookies.set(SESSION_COOKIE, createSessionValue(updated), getCookieOptions());
  return response;
}
