import { cookies } from "next/headers";
import { MentionProvider } from "@/components/mentions";
import type { MentionMember } from "@/lib/domain/mentions";
import { TANGO_MODE_ENABLED, isPortalTeam } from "@/lib/domain/portal";
import { listMembers } from "@/lib/server/portal-member-store";
import { getCurrentMember } from "@/lib/server/portal-session";
import "./portal.css";

// 部内ページ(ログイン・名簿・トレーニング)の共通の枠。文字(Google Fonts)は、サイト全体の枠(app/layout.tsx)で読む。
// 上のバーは、試合のページと同じもの(components/site-header-nav.tsx)を、サイト全体の枠で出す(2026-10-20 から)。
const MODE_COOKIE = "portal_mode";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    teamSlug: string;
  }>;
};

export default async function PortalLayout({ children, params }: LayoutProps) {
  // 見た目の切り替え(通常 / 単語帳)。端末ごとにクッキーで覚える。
  // トグルを止めている間は、前に単語帳を選んだ端末も通常の見た目で開く(戻す手段がなくなるため)。
  // トグルは上のバーにあった(2026-10-20 に上のバーを1つにしたときに外した。戻すなら git の履歴の components/portal-top-nav.tsx)。
  const isTango = TANGO_MODE_ENABLED && (await cookies()).get(MODE_COOKIE)?.value === "tango";

  // @ で呼ぶ候補と、本文の「@15林」の色付けに使う名簿(2026-11-13 から)。ログインした人にだけ渡す。
  const { teamSlug } = await params;
  const current = isPortalTeam(teamSlug) ? await getCurrentMember(teamSlug) : null;
  const mentionMembers: MentionMember[] = current
    ? (await listMembers(teamSlug)).map(({ id, name, displayName, number, position, grade }) => ({
        id,
        name,
        displayName,
        number,
        position,
        grade,
      }))
    : [];

  return (
    <div className="tp" data-mode={isTango ? "tango" : "std"}>
      <MentionProvider members={mentionMembers} currentId={current?.id ?? null}>
        <div className="tp-wrap">{children}</div>
      </MentionProvider>
    </div>
  );
}
