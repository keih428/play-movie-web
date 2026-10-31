import { NextRequest, NextResponse } from "next/server";
import { canEditMemberSlot, canManageSite, isPortalTeam } from "@/lib/domain/portal";
import { parseMemberInput } from "@/lib/server/portal-member-input";
import { getMember, listSystemAdmins, updateMember } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";

type RouteContext = {
  params: Promise<{
    memberId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "名簿を変える権限がありません。" }, { status: 403 });
  }

  const input = parseMemberInput((await request.json()) as Record<string, unknown>);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const { memberId } = await context.params;

  // システム担当でない人(ポジションのリーダー)は、自分のまとまりの部員の「枠」だけを直せる(2026-10-31 から)。
  if (!canManageSite(current)) {
    const onlySlot = Object.keys(input.patch).every((key) => key === "slot");
    const target = onlySlot ? await getMember(memberId) : null;
    if (!target || target.teamSlug !== teamSlug || !canEditMemberSlot(current, target)) {
      return NextResponse.json({ error: "名簿を変える権限がありません。" }, { status: 403 });
    }
  }

  // 名簿を変えられる人がいなくならないよう、最後のシステム担当は外せない。
  const removesAdministrator = input.patch.isSystemAdmin === false || input.patch.active === false;
  if (removesAdministrator) {
    const administrators = await listSystemAdmins(teamSlug);
    if (administrators.length === 1 && administrators[0].id === memberId) {
      return NextResponse.json(
        { error: "システム担当が1人もいなくなります。先に、ほかの人をシステム担当にしてください。" },
        { status: 400 },
      );
    }
  }
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
