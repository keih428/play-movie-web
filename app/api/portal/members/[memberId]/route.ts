import { NextRequest, NextResponse } from "next/server";
import { canManageMembers, isPortalTeam } from "@/lib/domain/portal";
import { parseMemberInput } from "@/lib/server/portal-member-input";
import { updateMember } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    memberId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current || !canManageMembers(current.role)) {
    return NextResponse.json({ error: "名簿を変える権限がありません。" }, { status: 403 });
  }

  const input = parseMemberInput((await request.json()) as Record<string, unknown>);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const { memberId } = await context.params;
  try {
    const member = await updateMember(teamSlug, memberId, input.patch);
    if (!member) {
      return NextResponse.json({ error: "名簿に見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ member });
  } catch (error) {
    if (error instanceof Error && error.message.includes("members_team_slug_name_key")) {
      return NextResponse.json({ error: "同じ名前の人がすでにいます。" }, { status: 409 });
    }
    throw error;
  }
}
