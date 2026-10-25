import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canViewLoginLog, isPortalTeam } from "@/lib/domain/portal";
import { buildTeamLoginLogPath, buildTeamMembersPath } from "@/lib/domain/team";
import {
  listLoginLogs,
  listMemberDevices,
  type LoginResult,
} from "@/lib/server/portal-login-log";
import { requireMember } from "@/lib/server/portal-session";

type PageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamic = "force-dynamic";

const RESULT_LABELS: Record<LoginResult, string> = {
  ok: "ログイン",
  bad_passphrase: "合言葉の間違い",
  bad_member_passphrase: "自分の合言葉の間違い",
  unknown_member: "名簿にない名前",
  locked: "制限中のアクセス",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TeamLoginLogPage({ params }: PageProps) {
  const { teamSlug } = await params;
  if (!isPortalTeam(teamSlug)) {
    notFound();
  }

  const current = await requireMember(teamSlug, buildTeamLoginLogPath(teamSlug));
  if (!canViewLoginLog(current)) {
    redirect(buildTeamMembersPath(teamSlug));
  }

  const [logs, devices] = await Promise.all([listLoginLogs(teamSlug), listMemberDevices(teamSlug)]);

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">システム担当用</span>
        <h1>ログインの記録</h1>
        <p className="tp-small tp-muted">
          新しい順に200件まで。知らない端末や合言葉の間違いが続いたら、合言葉を変える(全員がログインし直しになる)。
        </p>
        <div className="tp-actions">
          <Link className="tp-button tp-ghost" href={buildTeamMembersPath(teamSlug)}>
            名簿に戻る
          </Link>
        </div>
      </header>

      <section className="tp-section">
        <h2>ログイン</h2>
        <div className="tp-card tp-scroll">
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>結果</th>
                <th>名前</th>
                <th>IP アドレス</th>
                <th>端末</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className={log.result === "ok" ? undefined : "tp-warn"}>
                  <td className="tp-num">{formatDateTime(log.at)}</td>
                  <td className="tp-nowrap">
                    {RESULT_LABELS[log.result]}
                    {log.newDevice ? <span className="tp-badge">初めての端末</span> : null}
                  </td>
                  <td className="tp-nowrap">{log.memberName ?? "—"}</td>
                  <td className="tp-num">{log.ip ?? "—"}</td>
                  <td className="tp-agent">{log.userAgent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tp-section">
        <h2>最後に開いた日時</h2>
        <p className="tp-small tp-muted">部員・端末ごと。</p>
        <div className="tp-card tp-scroll">
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th>最後に開いた</th>
                <th>最初のログイン</th>
                <th>IP アドレス</th>
                <th>端末</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device, index) => (
                <tr key={index}>
                  <td className="tp-nowrap">{device.memberName}</td>
                  <td className="tp-num">{formatDateTime(device.lastSeenAt)}</td>
                  <td className="tp-num">{formatDateTime(device.firstSeenAt)}</td>
                  <td className="tp-num">{device.lastIp ?? "—"}</td>
                  <td className="tp-agent">{device.userAgent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
