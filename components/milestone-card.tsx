"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreMenu } from "@/components/more-menu";
import { MILESTONE_MAX, type MilestoneScope } from "@/lib/domain/milestones";
import { buildTeamApiPath } from "@/lib/domain/team";

type MilestoneCardProps = {
  teamSlug: string;
  // member = 個人(自分)、team = チーム(幹部が決める)。
  scope?: MilestoneScope;
  // 'YYYY-MM' と、表示用の「11月」。
  month: string;
  monthLabel: string;
  body: string | null;
  // 自分のものなら決める・書き直すができる。
  // 決める・書き直すができるか(個人は本人、チームは幹部)。
  canEdit: boolean;
  // これまでのマイルストーン(月ごとの記録)へのリンク。
  historyHref?: string;
  // ほかの人のものを出すときの名前(「〇〇さんの」)。
  ownerName?: string;
  // 来月のもの(月末の最終週だけ出す。2026-10-31 から)。
  upcoming?: boolean;
  // まだ決めていないとき、はじめから入力欄を開くか(月末の最終週は、今月の欄は開かない)。
  startOpen?: boolean;
};

/**
 * 個人の月間マイルストーン(2026-10-31 から)。ホームとノートの上に出す。
 * 今月のものがまだなければ、「月の初めに決めよう」と入力欄を出す。過去の月は記録として残り、書き換えない。
 */
export function MilestoneCard({
  teamSlug,
  scope = "member",
  month,
  monthLabel,
  body,
  canEdit,
  historyHref,
  ownerName,
  upcoming = false,
  startOpen = true,
}: MilestoneCardProps) {
  const router = useRouter();
  // 今月のものがまだなら、はじめから入力欄を開く。来月のものは「先に決める」を押してから。
  const [editing, setEditing] = useState(canEdit && !body && !upcoming && startOpen);
  const [draft, setDraft] = useState(body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(buildTeamApiPath("/api/portal/milestones", teamSlug), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, month, body: draft }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "保存できませんでした。");
      }
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  const isTeam = scope === "team";
  const title =
    (isTeam
      ? `チームの${monthLabel}のマイルストーン`
      : `${ownerName ? `${ownerName}さんの` : "自分の"}${monthLabel}のマイルストーン`) + (upcoming ? "(来月)" : "");
  const fieldId = `milestone-body-${scope}-${month}`;
  const prompt = upcoming
    ? "月末の1週間は、来月のマイルストーンを先に決められます。来月の1日から、ホームとノートに出ます。"
    : isTeam
    ? "月の初めに、チームとして今月どこまで行くかを1つ決めてください(幹部だけが決められます)。全員のホームに出ます。"
    : "月の初めに、今月どこまで行きたいかを1つ決めよう。ホームとノートの上、ノートの名前の横に出ます。";
  const cardClass = ["tp-milestone", isTeam ? "tp-milestone-team" : "", upcoming ? "tp-milestone-upcoming" : ""]
    .filter(Boolean)
    .join(" ");
  const placeholder = isTeam
    ? "例:サーブで崩す率を 40% に/全員がスクワット体重の1.25倍"
    : "例:サーブレシーブの返球率を 60% にする/スクワット 100kg を挙げる";

  if (editing) {
    return (
      <div className={cardClass}>
        <label className="tp-eyebrow" htmlFor={fieldId}>
          {title}
        </label>
        {body ? null : <p className="tp-small">{prompt}</p>}
        <div className="tp-field">
          <textarea
            id={fieldId}
            rows={2}
            maxLength={MILESTONE_MAX}
            placeholder={placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <div className="tp-actions">
          <button type="button" className="tp-button" disabled={saving || !draft.trim()} onClick={save}>
            {saving ? "保存しています…" : body ? "書き直す" : "決める"}
          </button>
          {body ? (
            <button
              type="button"
              className="tp-button tp-ghost"
              disabled={saving}
              onClick={() => {
                setDraft(body);
                setEditing(false);
                setError("");
              }}
            >
              やめる
            </button>
          ) : null}
          {historyHref ? (
            <Link className="tp-link tp-small" href={historyHref}>
              これまでのマイルストーン
            </Link>
          ) : null}
        </div>
        {error ? (
          <p className="tp-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // 「決める」「書き直す」は、右上の「⋯」の中に入れる(大きなボタンで見栄えが悪いため。けーいちの指摘、2026-10-31)。
  return (
    <div className={cardClass}>
      {canEdit || historyHref ? (
        <MoreMenu
          label={`${title}の操作`}
          items={[
            ...(canEdit
              ? [{ label: body ? "書き直す" : upcoming ? "先に決める" : "決める", onSelect: () => setEditing(true) }]
              : []),
            // これまでのマイルストーン(月ごとの記録)も「⋯」の中から開く(けーいちの指摘、2026-10-31)。
            ...(historyHref ? [{ label: "これまでのマイルストーン", href: historyHref }] : []),
          ]}
        />
      ) : null}
      <span className="tp-eyebrow">{title}</span>
      {body ? (
        <p className="tp-milestone-body">{body}</p>
      ) : upcoming ? (
        <p className="tp-small tp-muted">{canEdit ? prompt : "まだ決まっていません(主将が設定します)。"}</p>
      ) : (
        <p className="tp-small tp-muted">{isTeam ? "まだ決まっていません(主将が設定します)。" : "まだ決めていません。"}</p>
      )}
    </div>
  );
}
