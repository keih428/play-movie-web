"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { SlackTestButton } from "@/components/slack-test-button";
import {
  MEMBER_GROUP_LABELS,
  MEMBER_POSITIONS,
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  SYSTEM_ADMIN_LABEL,
  EXECUTIVE_LABEL,
  TRAINING_LEAD_LABEL,
  MEMBER_SLOTS,
  MEMBER_TIERS,
  getMemberGroup,
  sortMembers,
  type Member,
} from "@/lib/domain/portal";
import { EMPTY_DRAFT, toDraft, type MemberDraft } from "@/lib/domain/member-draft";
import {
  buildTeamAccountPath,
  buildTeamApiPath,
  buildTeamLoginLogPath,
  buildTeamMembersBulkEditPath,
  buildTeamRootPath,
} from "@/lib/domain/team";

type PortalMembersClientProps = {
  canManage: boolean;
  canViewLoginLog: boolean;
  currentMemberId: string;
  initialMembers: Member[];
  teamSlug: string;
};

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

function describeMember(member: Member, isPlayerTable: boolean) {
  const parts = [
    // スタッフの表では「スタッフ」は言うまでもないので、役職(肩書)などだけを出す(けーいちの指摘、2026-10-26)。
    member.role === "member" || !isPlayerTable ? null : MEMBER_ROLE_LABELS[member.role],
    member.isTrainingLead ? TRAINING_LEAD_LABEL : null,
    member.isSystemAdmin ? SYSTEM_ADMIN_LABEL : null,
    // 幹部かどうかは、名簿の一覧には出さない(「直す」の中だけで見える。けーいちの決定、2026-10-20)。
    member.title,
  ];
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
  const editingTarget = editingId && editingId !== "new" ? members.find((member) => member.id === editingId) : undefined;
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
    window.scrollTo({ top: 0 });
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
        setMembers((previous) => sortMembers([...previous, result.member]));
      } else {
        const result = await sendJson<{ member: Member }>(
          buildTeamApiPath(`/api/portal/members/${editingId}`, teamSlug),
          "PATCH",
          draft,
        );
        setMembers((previous) =>
          sortMembers(previous.map((member) => (member.id === result.member.id ? result.member : member))),
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

  // 忘れた人の自分の合言葉を消す(システム担当だけ)。消すと、その人はログインし直しになる。
  function clearPassphrase(memberId: string) {
    void run(async () => {
      const result = await sendJson<{ member: Member }>(
        buildTeamApiPath(`/api/portal/members/${memberId}/passphrase`, teamSlug),
        "DELETE",
      );
      setMembers((previous) =>
        sortMembers(previous.map((member) => (member.id === result.member.id ? result.member : member))),
      );
      setMessage(`${result.member.displayName} の自分の合言葉を消しました。次は名前を選ぶだけで入れます。`);
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
      <section className="tp-section">
        <h2>
          {title} <span className="tp-count">{rows.filter((member) => member.active).length}人</span>
        </h2>
        <div className="tp-card tp-scroll">
          <table className="tp-roster">
            <thead>
              <tr>
                <th className="tp-roster-number">背番号</th>
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
                  <tr key={member.id} className={member.active ? undefined : "tp-inactive"}>
                    {/* 背番号は左の列に出すので、名前の欄は名前だけにする。 */}
                    <td className="tp-num tp-roster-number">{member.number ?? "—"}</td>
                    <td>
                      <span className="tp-name">{member.name}</span>
                      {member.id === currentMemberId ? <span className="tp-sub">自分</span> : null}
                      {member.active ? null : <span className="tp-sub">名簿から外した</span>}
                    </td>
                    {isPlayerTable ? (
                      <td>
                        <span className="tp-num">
                          {member.grade ? `${member.grade}年 ` : ""}
                          {member.position}
                        </span>
                        {member.isLeader && group ? (
                          <span className="tp-badge">{MEMBER_GROUP_LABELS[group]}リーダー</span>
                        ) : null}
                      </td>
                    ) : null}
                    <td>
                      {describeMember(member, isPlayerTable) || (member.tier || member.slot ? "" : "—")}
                      {member.tier || member.slot ? (
                        <span className="tp-sub">
                          {member.tier ? <span className={`tp-tier ${member.tier}`}>{member.tier}</span> : null}{" "}
                          {member.slot ? `${member.slot}枠` : ""}
                        </span>
                      ) : null}
                    </td>
                    {canManage ? (
                      <td className="tp-num">
                        <button type="button" className="tp-mini" onClick={() => startEditing(member)}>
                          編集
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">部員とスタッフ</span>
        <h1>名簿</h1>
        <div className="tp-chips">
          {current ? (
            <span className="tp-chip">
              <b>{current.displayName}</b> としてログイン中
            </span>
          ) : null}
        </div>
        <div className="tp-actions">
          {canViewLoginLog ? (
            <Link className="tp-button tp-ghost" href={buildTeamLoginLogPath(teamSlug)}>
              ログインの記録
            </Link>
          ) : null}
          {canManage ? (
            <Link className="tp-button tp-ghost" href={buildTeamMembersBulkEditPath(teamSlug)}>
              まとめて編集
            </Link>
          ) : null}
          <Link className="tp-button tp-ghost" href={buildTeamAccountPath(teamSlug)}>
            自分の合言葉
          </Link>
          <button type="button" className="tp-button tp-ghost" onClick={logout} disabled={busy}>
            ログアウト
          </button>
        </div>
      </header>

      {message ? <p className="tp-message">{message}</p> : null}
      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}

      {canManage && editingId ? (
        <section className="tp-section">
          <h2>{editingId === "new" ? "部員・スタッフを足す" : `${draft.name} を編集`}</h2>
          <form className="tp-card" onSubmit={saveDraft}>
            <div className="tp-inputs">
              <div className="tp-field">
                <label htmlFor="member-name">名前</label>
                <input
                  id="member-name"
                  value={draft.name}
                  onChange={(event) => setField("name", event.target.value)}
                  required
                />
              </div>
              <div className="tp-field">
                <label htmlFor="member-number">背番号(スタッフは T・M・C など。ない人は空)</label>
                <input
                  id="member-number"
                  value={draft.number}
                  onChange={(event) => setField("number", event.target.value)}
                />
              </div>
              <div className="tp-field">
                <label htmlFor="member-grade">学年(スタッフは空でもよい)</label>
                <input
                  id="member-grade"
                  inputMode="numeric"
                  value={draft.grade}
                  onChange={(event) => setField("grade", event.target.value)}
                />
              </div>
              <div className="tp-field">
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
              <div className="tp-field">
                <label htmlFor="member-role">役割(部員かスタッフか)</label>
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
              <div className="tp-field">
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
              <div className="tp-field">
                <label htmlFor="member-slot">枠(A と B はいつも一緒。トレーニングも同じ。C は別)</label>
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
              <div className="tp-field">
                <label htmlFor="member-title">肩書(主将、マネージャー など)</label>
                <input
                  id="member-title"
                  value={draft.title}
                  onChange={(event) => setField("title", event.target.value)}
                />
              </div>
              <div className="tp-field">
                <label htmlFor="member-slack">Slack の ID</label>
                <input
                  id="member-slack"
                  value={draft.slackId}
                  onChange={(event) => setField("slackId", event.target.value)}
                />
              </div>
            </div>
            <label className="tp-check">
              <input
                type="checkbox"
                checked={draft.isLeader}
                onChange={(event) => setField("isLeader", event.target.checked)}
              />
              ポジションのリーダー(OH のリーダーは OP も受け持つ)
            </label>
            <label className="tp-check">
              <input
                type="checkbox"
                checked={draft.isTrainingLead}
                onChange={(event) => setField("isTrainingLead", event.target.checked)}
              />
              {TRAINING_LEAD_LABEL}(メニューを入れる・練習日を変える・ノートを消す。「トレーニング担当へ」の知らせが届く)
            </label>
            <label className="tp-check">
              <input
                type="checkbox"
                checked={draft.isSystemAdmin}
                onChange={(event) => setField("isSystemAdmin", event.target.checked)}
              />
              {SYSTEM_ADMIN_LABEL}(名簿を変える・ログインの記録を見る・Slack の知らせを試す。役割と兼ねられる)
            </label>
            <label className="tp-check">
              <input
                type="checkbox"
                checked={draft.isExecutive}
                onChange={(event) => setField("isExecutive", event.target.checked)}
              />
              {EXECUTIVE_LABEL}(ホームのチームの目標と、データベース/マニュアルを編集できる)
            </label>
            <label className="tp-check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => setField("active", event.target.checked)}
              />
              名簿に載せる(外すと、その人はログインできなくなる)
            </label>
            {editingTarget ? (
              <p className="tp-small tp-muted">
                自分の合言葉:{editingTarget.hasPassphrase ? "決めてある" : "まだ決めていない"}
                {editingTarget.hasPassphrase ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="tp-mini"
                      disabled={busy}
                      onClick={() => clearPassphrase(editingTarget.id)}
                    >
                      忘れたので消す
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="tp-actions">
              <button className="tp-button" type="submit" disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </button>
              <button
                className="tp-button tp-ghost"
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
        <section className="tp-section">
          <h2>名簿を変える</h2>
          <p className="tp-small tp-muted">名簿を変えられるのは、システム担当だけです。</p>
          <div className="tp-actions">
            <button type="button" className="tp-button tp-ghost" onClick={() => startEditing(null)}>
              1人足す
            </button>
          </div>
          <details className="tp-ref">
            <summary>Slack の知らせが届くか確かめる</summary>
            <div className="tp-ref-body">
              <SlackTestButton teamSlug={teamSlug} />
            </div>
          </details>
          <details className="tp-ref">
            <summary>表(Markdown)を貼ってまとめて取り込む</summary>
            <form className="tp-ref-body" onSubmit={importRoster}>
              <p className="tp-small tp-muted">
                名前が同じ人は上書きし、いない人は足します。表にいない人はそのまま残ります。段階・枠・Slack の ID
                は変わりません。背番号は、表に「背番号」の列があるときだけ書き換えます。役割の列に「システム担当」と
                書くとシステム担当、「トレーニング担当」と書くとトレーニング担当になります(兼ねるなら「トレーニング担当・システム担当」、
                スタッフは「スタッフ」も並べる)。外すのは「編集」からです。
              </p>
              <div className="tp-field">
                <label htmlFor="roster-markdown">名簿の表</label>
                <textarea
                  id="roster-markdown"
                  rows={8}
                  value={rosterMarkdown}
                  onChange={(event) => setRosterMarkdown(event.target.value)}
                  required
                />
              </div>
              <div>
                <button className="tp-button" type="submit" disabled={busy || !rosterMarkdown.trim()}>
                  取り込む
                </button>
              </div>
            </form>
          </details>
        </section>
      ) : null}
    </>
  );
}
