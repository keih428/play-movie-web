import { NextResponse } from "next/server";
import type { Member } from "@/lib/domain/portal";
import { isPortalTeam } from "@/lib/domain/portal";
import { canUseInputAssist } from "@/lib/domain/input-assist/session";
import { getCurrentMember } from "@/lib/server/portal-session";

/** API 用。使える人なら部員を、だめなら返すレスポンスを返す。 */
export async function authorizeInputAssist(
  teamSlug: string,
): Promise<{ member: Member; error?: undefined } | { member?: undefined; error: NextResponse }> {
  const member = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!member) {
    return { error: NextResponse.json({ error: "ログインしてください。" }, { status: 401 }) };
  }
  if (!canUseInputAssist(member)) {
    return { error: NextResponse.json({ error: "打ち込み補助を使えるのは、スタッフだけです。" }, { status: 403 }) };
  }
  return { member };
}
