"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { diffDraft, toDraft, type MemberDraft } from "@/lib/domain/member-draft";
import {
  EXECUTIVE_LABEL,
  MEMBER_POSITIONS,
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  MEMBER_SLOTS,
  MEMBER_TIERS,
  SYSTEM_ADMIN_LABEL,
  TRAINING_LEAD_LABEL,
  sortMembers,
  type Member,
} from "@/lib/domain/portal";
import { buildTeamApiPath, buildTeamMembersPath } from "@/lib/domain/team";

type PortalMembersBulkClientProps = {
  teamSlug: string;
  initialMembers: Member[];
  // ポジションのリーダー用:自分のまとまりの部員の「枠」だけを直せる(2026-10-31 から)。
  slotOnly?: boolean;
};

type TextKey = "number" | "name" | "grade" | "title" | "slackId";
type ChoiceKey = "position" | "role" | "tier" | "slot";
type FlagKey = "isLeader" | "isTrainingLead" | "isSystemAdmin" | "isExecutive" | "active";

const FLAG_COLUMNS: { key: FlagKey; label: string }[] = [
  { key: "isLeader", label: "リーダー" },
  { key: "isTrainingLead", label: TRAINING_LEAD_LABEL },
  { key: "isSystemAdmin", label: SYSTEM_ADMIN_LABEL },
  { key: "isExecutive", label: EXECUTIVE_LABEL },
  { key: "active", label: "名簿に載せる" },
];

/**
 * 名簿のまとめて編集(システム担当、2026-10-26 から。ポジションのリーダーは枠だけ、2026-10-31 から)。
 * 全員を1つの表に並べ、変えた行に色を付ける。「保存」で、変えた人の変えた項目だけを1人ずつ送る
 * (1人ずつの「編集」と同じ API なので、確かめ方も同じ。失敗した人は行に理由を出して、残りは保存する)。
 */
export function PortalMembersBulkClient({ teamSlug, initialMembers, slotOnly = false }: PortalMembersBulkClientProps) {
  const [members, setMembers] = useState(initialMembers);
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>(() =>
    Object.fromEntries(initialMembers.map((member) => [member.id, toDraft(member)])),
  );
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const changes = useMemo(
    () =>
      members
        .map((member) => ({ member, patch: diffDraft(toDraft(member), drafts[member.id]) }))
        .filter((entry): entry is { member: Member; patch: Partial<MemberDraft> } => entry.patch !== null),
    [drafts, members],
  );

  function setField<K extends keyof MemberDraft>(memberId: string, key: K, value: MemberDraft[K]) {
    setDrafts((previous) => ({ ...previous, [memberId]: { ...previous[memberId], [key]: value } }));
  }

  async function saveAll() {
    setBusy(true);
    setMessage("");
    const errors: Record<string, string> = {};
    let saved = 0;
    // 1人ずつ順に送る(最後のシステム担当を外さない、などの確かめを1人ずつ通すため)。
    for (const { member, patch } of changes) {
      try {
        const response = await fetch(buildTeamApiPath(`/api/portal/members/${member.id}`, teamSlug), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const payload = (await response.json()) as { member?: Member; error?: string };
        if (!response.ok || !payload.member) {
          throw new Error(payload.error ?? "保存できませんでした。");
        }
        const updated = payload.member;
        setMembers((previous) => previous.map((entry) => (entry.id === updated.id ? updated : entry)));
        setDrafts((previous) => ({ ...previous, [updated.id]: toDraft(updated) }));
        saved += 1;
      } catch (caught) {
        errors[member.id] = caught instanceof Error ? caught.message : "保存できませんでした。";
      }
    }
    setRowErrors(errors);
    const failed = Object.keys(errors).length;
    setMessage(
      failed > 0
        ? `${saved}人を保存しました。${failed}人は保存できませんでした(赤い行に理由)。`
        : `${saved}人を保存しました。`,
    );
    setBusy(false);
  }

  function resetAll() {
    setDrafts(Object.fromEntries(members.map((member) => [member.id, toDraft(member)])));
    setRowErrors({});
    setMessage("");
  }

  const text = (member: Member, key: TextKey, size: number, inputMode?: "numeric") => (
    <input
      aria-label={`${member.name} の${TEXT_LABELS[key]}`}
      className="tp-bulk-input"
      size={size}
      inputMode={inputMode}
      value={drafts[member.id][key]}
      onChange={(event) => setField(member.id, key, event.target.value)}
    />
  );

  const choice = (member: Member, key: ChoiceKey, options: readonly string[], empty: string | null, labels?: Record<string, string>) => (
    <select
      aria-label={`${member.name} の${CHOICE_LABELS[key]}`}
      className="tp-bulk-input"
      value={drafts[member.id][key]}
      onChange={(event) => setField(member.id, key, event.target.value)}
    >
      {empty !== null ? <option value="">{empty}</option> : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );

  const saveBar = (
    <div className="tp-actions">
      <button className="tp-button" type="button" disabled={busy || changes.length === 0} onClick={() => void saveAll()}>
        {busy ? "保存中…" : changes.length > 0 ? `保存(${changes.length}人)` : "保存"}
      </button>
      <button className="tp-button tp-ghost" type="button" disabled={busy || changes.length === 0} onClick={resetAll}>
        変更をやめる
      </button>
      <Link className="tp-button tp-ghost" href={buildTeamMembersPath(teamSlug)}>
        名簿に戻る
      </Link>
    </div>
  );

  if (slotOnly) {
    return (
      <>
        <header className="tp-hero">
          <span className="tp-eyebrow">ポジションのリーダー</span>
          <h1>枠をまとめて編集</h1>
          <p className="tp-small tp-muted">
            自分のポジションの部員の枠(A・B・C)を編集できます。編集したい所を全部編集してから、「保存」を1回押します。色の付いた行が、まだ保存していない行です。
          </p>
          {saveBar}
        </header>

        {message ? <p className="tp-message">{message}</p> : null}

        <div className="tp-card tp-scroll">
          <table className="tp-roster tp-bulk">
            <thead>
              <tr>
                <th className="tp-bulk-sticky">名前</th>
                <th>学年</th>
                <th>ポジション</th>
                <th>枠</th>
              </tr>
            </thead>
            <tbody>
              {sortMembers(members).map((member) => {
                const changed = changes.some((entry) => entry.member.id === member.id);
                const rowError = rowErrors[member.id];
                const classes = [changed ? "tp-bulk-changed" : "", rowError ? "tp-bulk-error" : ""].filter(Boolean);
                return (
                  <tr key={member.id} className={classes.join(" ") || undefined}>
                    <td className="tp-bulk-sticky">
                      {member.displayName}
                      {rowError ? <span className="tp-sub tp-bulk-reason">{rowError}</span> : null}
                    </td>
                    <td>{member.grade ?? "—"}</td>
                    <td>{member.position ?? "—"}</td>
                    <td>{choice(member, "slot", MEMBER_SLOTS, "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="tp-gap">{saveBar}</div>
      </>
    );
  }

  return (
    <>
      <header className="tp-hero">
        <span className="tp-eyebrow">システム担当だけ</span>
        <h1>名簿をまとめて編集</h1>
        <p className="tp-small tp-muted">
          直したい所を全部直してから、「保存」を1回押します。色の付いた行が、まだ保存していない行です。名簿から外した人は、下の方に薄く出ます。
        </p>
        {saveBar}
      </header>

      {message ? <p className="tp-message">{message}</p> : null}

      <div className="tp-card tp-scroll">
        <table className="tp-roster tp-bulk">
          <thead>
            <tr>
              <th className="tp-bulk-sticky">名前</th>
              <th>背番号</th>
              <th>学年</th>
              <th>ポジション</th>
              <th>役割</th>
              <th>段階</th>
              <th>枠</th>
              <th>肩書</th>
              <th>Slack の ID</th>
              {FLAG_COLUMNS.map((column) => (
                <th key={column.key} className="tp-bulk-flag">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortMembers(members).map((member) => {
              const changed = changes.some((entry) => entry.member.id === member.id);
              const rowError = rowErrors[member.id];
              const classes = [
                changed ? "tp-bulk-changed" : "",
                rowError ? "tp-bulk-error" : "",
                drafts[member.id].active ? "" : "tp-inactive",
              ].filter(Boolean);
              return (
                <tr key={member.id} className={classes.join(" ") || undefined}>
                  <td className="tp-bulk-sticky">
                    {text(member, "name", 8)}
                    {rowError ? <span className="tp-sub tp-bulk-reason">{rowError}</span> : null}
                  </td>
                  <td>{text(member, "number", 3)}</td>
                  <td>{text(member, "grade", 2, "numeric")}</td>
                  <td>{choice(member, "position", MEMBER_POSITIONS, "なし")}</td>
                  <td>{choice(member, "role", MEMBER_ROLES, null, MEMBER_ROLE_LABELS)}</td>
                  <td>{choice(member, "tier", MEMBER_TIERS, "—")}</td>
                  <td>{choice(member, "slot", MEMBER_SLOTS, "—")}</td>
                  <td>{text(member, "title", 8)}</td>
                  <td>{text(member, "slackId", 11)}</td>
                  {FLAG_COLUMNS.map((column) => (
                    <td key={column.key} className="tp-bulk-flag">
                      <input
                        type="checkbox"
                        aria-label={`${member.name} の${column.label}`}
                        checked={drafts[member.id][column.key]}
                        onChange={(event) => setField(member.id, column.key, event.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tp-gap">{saveBar}</div>
    </>
  );
}

const TEXT_LABELS: Record<TextKey, string> = {
  number: "背番号",
  name: "名前",
  grade: "学年",
  title: "肩書",
  slackId: "Slack の ID",
};

const CHOICE_LABELS: Record<ChoiceKey, string> = {
  position: "ポジション",
  role: "役割",
  tier: "段階",
  slot: "枠",
};
