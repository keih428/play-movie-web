"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  MEMBER_GROUP_LABELS,
  MEMBER_POSITIONS,
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  MEMBER_SLOTS,
  MEMBER_TIERS,
  getMemberGroup,
  type Member,
} from "@/lib/domain/portal";
import { buildTeamApiPath, buildTeamLoginLogPath, buildTeamRootPath } from "@/lib/domain/team";

type PortalMembersClientProps = {
  canManage: boolean;
  canViewLoginLog: boolean;
  currentMemberId: string;
  initialMembers: Member[];
  teamSlug: string;
};

type MemberDraft = {
  name: string;
  grade: string;
  position: string;
  isLeader: boolean;
  role: string;
  title: string;
  tier: string;
  slot: string;
  slackId: string;
  active: boolean;
};

const EMPTY_DRAFT: MemberDraft = {
  name: "",
  grade: "",
  position: "",
  isLeader: false,
  role: "member",
  title: "",
  tier: "",
  slot: "",
  slackId: "",
  active: true,
};

function toDraft(member: Member): MemberDraft {
  return {
    name: member.name,
    grade: member.grade === null ? "" : String(member.grade),
    position: member.position ?? "",
    isLeader: member.isLeader,
    role: member.role,
    title: member.title ?? "",
    tier: member.tier ?? "",
    slot: member.slot ?? "",
    slackId: member.slackId ?? "",
    active: member.active,
  };
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "うまくいきませんでした。もう一度試してください。");
  }
  return payload;
}

function describeMember(member: Member) {
  const parts = [member.role === "member" ? null : MEMBER_ROLE_LABELS[member.role], member.title];
  return parts.filter(Boolean).join("・");
}

export function PortalMembersClient({
  canManage,
  canViewLoginLog,
  currentMemberId,
  initialMembers,
  teamSlug,
}: PortalMembersClientProps) {
  const [members, setMembers] = useState(initialMembers);
  // 編集中の部員の ID。"new" は追加。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_DRAFT);
  const [rosterMarkdown, setRosterMarkdown] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const current = members.find((member) => member.id === currentMemberId);
  const players = members.filter((member) => member.position);
  const staff = members.filter((member) => !member.position);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function startEditing(member: Member | null) {
    setEditingId(member ? member.id : "new");
    setDraft(member ? toDraft(member) : EMPTY_DRAFT);
    setError("");
    setMessage("");
  }

  function saveDraft(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (editingId === "new") {
        const result = await sendJson<{ member: Member }>(
          buildTeamApiPath("/api/portal/members", teamSlug),
          "POST",
          { member: draft },
        );
        setMembers((previous) => [...previous, result.member]);
      } else {
        const result = await sendJson<{ member: Member }>(
          buildTeamApiPath(`/api/portal/members/${editingId}`, teamSlug),
          "PATCH",
          draft,
        );
        setMembers((previous) =>
          previous.map((member) => (member.id === result.member.id ? result.member : member)),
        );
      }
      setEditingId(null);
      setMessage("保存しました。");
    });
  }

  function importRoster(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await sendJson<{ added: number; updated: number; members: Member[] }>(
        buildTeamApiPath("/api/portal/members", teamSlug),
        "POST",
        { markdown: rosterMarkdown },
      );
      setMembers(result.members);
      setRosterMarkdown("");
      setMessage(`取り込みました(追加 ${result.added}人、上書き ${result.updated}人)。`);
    });
  }

  function logout() {
    void run(async () => {
      await sendJson(buildTeamApiPath("/api/portal/logout", teamSlug), "POST");
      window.location.assign(buildTeamRootPath(teamSlug));
    });
  }

  function setField<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function renderTable(title: string, rows: Member[], isPlayerTable: boolean) {
    return (
      <section className="panel">
        <div className="panel-inner stack">
          <h2>
            {title}({rows.filter((member) => member.active).length}人)
          </h2>
          <div className="score-table-wrap portal-table-wrap">
            <table className="score-table portal-table">
              <thead>
                <tr>
                  <th>名前</th>
                  {isPlayerTable ? <th>ポジション</th> : null}
                  <th>役割</th>
                  {canManage ? <th aria-label="操作" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => {
                  const group = getMemberGroup(member.position);
                  return (
                    <tr key={member.id} className={member.active ? undefined : "portal-row-inactive"}>
                      <td>
                        {member.name}
                        {member.id === currentMemberId ? <span className="tag">自分</span> : null}
                        {member.active ? null : <span className="tag">名簿から外した</span>}
                      </td>
                      {isPlayerTable ? (
                        <td>
                          {member.grade ? `${member.grade}年・` : ""}
                          {member.position}
                          {member.isLeader && group ? (
                            <span className="tag">{MEMBER_GROUP_LABELS[group]}リーダー</span>
                          ) : null}
                        </td>
                      ) : null}
                      <td>
                        {describeMember(member) || (member.tier || member.slot ? "" : "—")}
                        {member.tier || member.slot ? (
                          <span className="portal-cell-sub">
                            {[member.tier, member.slot && `${member.slot}枠`].filter(Boolean).join("・")}
                          </span>
                        ) : null}
                      </td>
                      {canManage ? (
                        <td>
                          <button
                            type="button"
                            className="button secondary portal-small-button"
                            onClick={() => startEditing(member)}
                          >
                            直す
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <div className="panel-inner section-heading-row">
          <div>
            <h2>名簿</h2>
            <p className="portal-note">
              {current ? `${current.name} としてログイン中。` : null}
              ログアウトするまで、この端末で使い続けられます。
            </p>
          </div>
          <div className="button-row">
            {canViewLoginLog ? (
              <Link className="button secondary" href={buildTeamLoginLogPath(teamSlug)}>
                ログインの記録
              </Link>
            ) : null}
            <button type="button" className="button secondary" onClick={logout} disabled={busy}>
              ログアウト
            </button>
          </div>
        </div>
      </section>

      {message ? <p className="portal-message">{message}</p> : null}
      {error ? (
        <p className="portal-error" role="alert">
          {error}
        </p>
      ) : null}

      {canManage && editingId ? (
        <section className="panel">
          <form className="panel-inner stack" onSubmit={saveDraft}>
            <h2>{editingId === "new" ? "部員・スタッフを足す" : `${draft.name} を直す`}</h2>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="member-name">名前</label>
                <input
                  id="member-name"
                  value={draft.name}
                  onChange={(event) => setField("name", event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="member-grade">学年(スタッフは空でもよい)</label>
                <input
                  id="member-grade"
                  inputMode="numeric"
                  value={draft.grade}
                  onChange={(event) => setField("grade", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="member-position">ポジション(スタッフは「なし」)</label>
                <select
                  id="member-position"
                  value={draft.position}
                  onChange={(event) => setField("position", event.target.value)}
                >
                  <option value="">なし</option>
                  {MEMBER_POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="member-role">役割</label>
                <select
                  id="member-role"
                  value={draft.role}
                  onChange={(event) => setField("role", event.target.value)}
                >
                  {MEMBER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {MEMBER_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="member-title">肩書(主将、マネージャー など)</label>
                <input
                  id="member-title"
                  value={draft.title}
                  onChange={(event) => setField("title", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="member-slack">Slack の ID</label>
                <input
                  id="member-slack"
                  value={draft.slackId}
                  onChange={(event) => setField("slackId", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="member-tier">段階</label>
                <select
                  id="member-tier"
                  value={draft.tier}
                  onChange={(event) => setField("tier", event.target.value)}
                >
                  <option value="">まだ決めていない</option>
                  {MEMBER_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="member-slot">枠</label>
                <select
                  id="member-slot"
                  value={draft.slot}
                  onChange={(event) => setField("slot", event.target.value)}
                >
                  <option value="">まだ決めていない</option>
                  {MEMBER_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="portal-check">
              <input
                type="checkbox"
                checked={draft.isLeader}
                onChange={(event) => setField("isLeader", event.target.checked)}
              />
              ポジションのリーダー(OH のリーダーは OP も受け持つ)
            </label>
            <label className="portal-check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => setField("active", event.target.checked)}
              />
              名簿に載せる(外すと、その人はログインできなくなる)
            </label>
            <div className="button-row">
              <button className="button" type="submit" disabled={busy}>
                保存
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditingId(null)}
                disabled={busy}
              >
                やめる
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {renderTable("プレイヤー", players, true)}
      {renderTable("スタッフ", staff, false)}

      {canManage ? (
        <section className="panel">
          <div className="panel-inner stack">
            <h2>名簿を変える</h2>
            <div className="button-row">
              <button type="button" className="button secondary" onClick={() => startEditing(null)}>
                1人足す
              </button>
            </div>
            <details>
              <summary>表(Markdown)を貼ってまとめて取り込む</summary>
              <form className="stack portal-details-body" onSubmit={importRoster}>
                <p className="portal-note">
                  名前が同じ人は上書きし、いない人は足します。表にいない人はそのまま残ります。段階・枠・Slack
                  の ID は変わりません。
                </p>
                <div className="field">
                  <label htmlFor="roster-markdown">名簿の表</label>
                  <textarea
                    id="roster-markdown"
                    rows={8}
                    value={rosterMarkdown}
                    onChange={(event) => setRosterMarkdown(event.target.value)}
                    required
                  />
                </div>
                <button className="button" type="submit" disabled={busy || !rosterMarkdown.trim()}>
                  取り込む
                </button>
              </form>
            </details>
          </div>
        </section>
      ) : null}
    </>
  );
}
