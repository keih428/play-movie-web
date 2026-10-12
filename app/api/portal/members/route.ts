import { NextRequest, NextResponse } from "next/server";
import {
  canAdminister,
  isPortalTeam,
  parseRosterMarkdown,
  type MemberInput,
} from "@/lib/domain/portal";
import { parseMemberInput } from "@/lib/server/portal-member-input";
import {
  countMembers,
  createMember,
  listAdministrators,
  listMembers,
  upsertMembers,
} from "@/lib/server/portal-member-store";
import { getCurrentMember, isCorrectPassphrase } from "@/lib/server/portal-session";

export async function GET(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  if (!current) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const members = await listMembers(teamSlug, { includeInactive: canAdminister(current.role) });
  return NextResponse.json({ members });
}

export async function POST(request: NextRequest) {
  const teamSlug = request.nextUrl.searchParams.get("team") ?? "";
  if (!isPortalTeam(teamSlug)) {
    return NextResponse.json({ error: "このチームでは使えません。" }, { status: 404 });
  }

  const payload = (await request.json()) as {
    markdown?: string;
    member?: Partial<MemberInput>;
    passphrase?: string;
  };

  // 名簿を変えられるのはトレーニング担当だけ。ただし名簿が空のあいだは、合言葉を知っている人が
  // 最初の取り込みをできる(まだ誰もログインできないため)。
  const current = await getCurrentMember(teamSlug);
  const isFirstImport =
    !current &&
    typeof payload.markdown === "string" &&
    isCorrectPassphrase(payload.passphrase ?? "") &&
    (await countMembers(teamSlug)) === 0;
  if (!isFirstImport && !(current && canAdminister(current.role))) {
    return NextResponse.json({ error: "名簿を変える権限がありません。" }, { status: 403 });
  }

  if (typeof payload.markdown === "string") {
    const inputs = parseRosterMarkdown(payload.markdown);
    if (inputs.length === 0) {
      return NextResponse.json(
        { error: "表を読み取れませんでした。「名前」と「ポジション」の列がある表を貼ってください。" },
        { status: 400 },
      );
    }
    // 取り込んだあとに、名簿を変えられる人(トレーニング担当)が1人は残るようにする。
    const importedNames = new Set(inputs.map((input) => input.name));
    const keepsAdministrator =
      inputs.some((input) => input.role === "training_lead") ||
      (await listAdministrators(teamSlug)).some((member) => !importedNames.has(member.name));
    if (!keepsAdministrator) {
      return NextResponse.json(
        { error: "表の中に「トレーニング担当」の人が1人は要ります(役割の列に「トレーニング担当」と書く)。" },
        { status: 400 },
      );
    }
    const result = await upsertMembers(teamSlug, inputs);
    return NextResponse.json({ ...result, members: await listMembers(teamSlug, { includeInactive: true }) });
  }

  const input = parseMemberInput(payload.member ?? {});
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }
  if (!input.patch.name) {
    return NextResponse.json({ error: "名前を入れてください。" }, { status: 400 });
  }

  try {
    const member = await createMember(teamSlug, {
      name: input.patch.name,
      number: input.patch.number ?? null,
      grade: input.patch.grade ?? null,
      position: input.patch.position ?? null,
      isLeader: input.patch.isLeader ?? false,
      role: input.patch.role ?? "member",
      title: input.patch.title ?? null,
    });
    return NextResponse.json({ member });
  } catch (error) {
    if (error instanceof Error && error.message.includes("members_team_slug_name_key")) {
      return NextResponse.json({ error: "同じ名前の人がすでにいます。" }, { status: 409 });
    }
    throw error;
  }
}
