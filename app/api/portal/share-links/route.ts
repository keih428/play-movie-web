import { NextRequest, NextResponse } from "next/server";
import { canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamScheduleSharePath } from "@/lib/domain/team";
import { getCurrentMember } from "@/lib/server/portal-session";
import { issueShareLink, revokeShareLink } from "@/lib/server/portal-share-link-store";

// 監督向けの予定表の共有リンク。発行・作り直し(POST)と、止める(DELETE)。システム担当だけ。
async function authorize(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return { error: NextResponse.json({ error: "ログインしてください。" }, { status: 401 }) };
  }
  if (!canManageSite(current)) {
    return {
      error: NextResponse.json({ error: "共有リンクを扱えるのは、システム担当だけです。" }, { status: 403 }),
    };
  }
  return { teamSlug, current };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) {
    return auth.error;
  }
  const token = await issueShareLink(auth.teamSlug, "schedule", auth.current.id);
  return NextResponse.json({ path: buildTeamScheduleSharePath(auth.teamSlug, token) });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) {
    return auth.error;
  }
  await revokeShareLink(auth.teamSlug, "schedule");
  return NextResponse.json({ ok: true });
}
