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
  if (!canViewLoginLog(current.role)) {
    redirect(buildTeamMembersPath(teamSlug));
  }

  const [logs, devices] = await Promise.all([listLoginLogs(teamSlug), listMemberDevices(teamSlug)]);

  return (
    <main className="page-shell stack">
      <section className="panel">
        <div className="panel-inner stack">
          <div className="section-heading-row">
            <h2>ログインの記録</h2>
            <Link className="button secondary" href={buildTeamMembersPath(teamSlug)}>
              名簿に戻る
            </Link>
          </div>
          <p className="portal-note">
            新しい順に200件まで。合言葉を変えると、全員がログインし直しになる。
          </p>
          <div className="score-table-wrap">
            <table className="score-table portal-table">
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
                  <tr key={log.id} className={log.result === "ok" ? undefined : "portal-row-warning"}>
                    <td>{formatDateTime(log.at)}</td>
                    <td>
                      {RESULT_LABELS[log.result]}
                      {log.newDevice ? <span className="tag">初めての端末</span> : null}
                    </td>
                    <td>{log.memberName ?? "—"}</td>
                    <td>{log.ip ?? "—"}</td>
                    <td className="portal-cell-small">{log.userAgent ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-inner stack">
          <h2>最後に開いた日時(部員・端末ごと)</h2>
          <div className="score-table-wrap">
            <table className="score-table portal-table">
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
                    <td>{device.memberName}</td>
                    <td>{formatDateTime(device.lastSeenAt)}</td>
                    <td>{formatDateTime(device.firstSeenAt)}</td>
                    <td>{device.lastIp ?? "—"}</td>
                    <td className="portal-cell-small">{device.userAgent ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
