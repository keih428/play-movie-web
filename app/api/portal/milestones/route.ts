import { NextRequest, NextResponse } from "next/server";
import { MILESTONE_MAX, getEditableMilestoneMonths, monthOf, normalizeMilestone } from "@/lib/domain/milestones";
import { canSetTeamMilestone, isPortalTeam } from "@/lib/domain/portal";
import { saveMilestone, saveTeamMilestone } from "@/lib/server/portal-milestone-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import { getTodayInJapan } from "@/lib/server/portal-training-store";

// 今月(月末の最終週なら来月も)のマイルストーンを決める・書き直す。scope: "team" はチームのもの(幹部だけ)、
// それ以外は自分のもの。過去の月は記録として残すので、書き換えられない。month を省いたら今月。
export async function PUT(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    body?: unknown;
    month?: unknown;
    scope?: unknown;
  } | null;
  const isTeam = payload?.scope === "team";
  if (isTeam && !canSetTeamMilestone(current)) {
    return NextResponse.json({ error: "チームのマイルストーンを決められるのは、幹部だけです。" }, { status: 403 });
  }
  const today = getTodayInJapan();
  const month = payload?.month === undefined ? monthOf(today) : payload.month;
  if (typeof month !== "string" || !getEditableMilestoneMonths(today).includes(month)) {
    return NextResponse.json(
      {
        error:
          "書けるのは今月のマイルストーンと、月末の最終週なら来月のものだけです。ページを読み込み直してください。",
      },
      { status: 400 },
    );
  }
  const body = normalizeMilestone(payload?.body);
  if (!body) {
    return NextResponse.json({ error: `1〜${MILESTONE_MAX}文字で書いてください。` }, { status: 400 });
  }

  if (isTeam) {
    await saveTeamMilestone(teamSlug, month, body, current.id);
  } else {
    await saveMilestone(teamSlug, current.id, month, body);
  }
  return NextResponse.json({ ok: true, month });
}
