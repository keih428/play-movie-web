"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { PERSONAL_ITEM_LIMITS, type PersonalItem } from "@/lib/domain/personal-items";
import { buildTeamApiPath } from "@/lib/domain/team";
import { TRAINING_DAYS, TRAINING_DAY_LABELS, type TrainingDay } from "@/lib/domain/training";

type TrainingPersonalItemsProps = {
  teamSlug: string;
  members: { id: string; displayName: string }[];
};

// 面談で決めた種目は、ふつう土曜と自主の「個人の追加」の枠でやる。
const DEFAULT_DAYS: TrainingDay[] = ["sat", "self"];

/**
 * 個人の追加メニュー(トレーニング担当だけ、2026-10-26 から)。部員を選んで、その人の画面のメニューに種目を足す・消す。
 * 足した種目は、その人のメニューの「個人の追加」の行に入り、トレ録の欄にも最初から入る。
 */
export function TrainingPersonalItems({ teamSlug, members }: TrainingPersonalItemsProps) {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [items, setItems] = useState<PersonalItem[] | null>(null);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [tip, setTip] = useState("");
  const [days, setDays] = useState<TrainingDay[]>(DEFAULT_DAYS);
  const [weighted, setWeighted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const apiPath = buildTeamApiPath("/api/portal/training/personal", teamSlug);

  useEffect(() => {
    if (!memberId) {
      setItems(null);
      return;
    }
    let cancelled = false;
    setItems(null);
    void fetch(`${apiPath}&member=${encodeURIComponent(memberId)}`)
      .then((response) => response.json() as Promise<{ items?: PersonalItem[]; error?: string }>)
      .then((payload) => {
        if (!cancelled) {
          setItems(payload.items ?? []);
          setError(payload.error ?? "");
        }
      })
      .catch(() => !cancelled && setError("読み込めませんでした。"));
    return () => {
      cancelled = true;
    };
  }, [apiPath, memberId]);

  async function send(input: RequestInit & { url: string }) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(input.url, { ...input, headers: { "content-type": "application/json" } });
      const payload = (await response.json()) as { items?: PersonalItem[]; error?: string };
      if (!response.ok || !payload.items) {
        throw new Error(payload.error ?? "うまくいきませんでした。");
      }
      setItems(payload.items);
      // 自分(担当)のメニューに足したときにも、上の表示を新しくする。
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "うまくいきませんでした。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const ok = await send({
      url: apiPath,
      method: "POST",
      body: JSON.stringify({ memberId, name, dose, tip, days, weighted }),
    });
    if (ok) {
      setName("");
      setDose("");
      setTip("");
      setWeighted(false);
    }
  }

  function toggleDay(day: TrainingDay) {
    setDays((previous) =>
      previous.includes(day) ? previous.filter((entry) => entry !== day) : TRAINING_DAYS.filter((entry) => entry === day || previous.includes(entry)),
    );
  }

  return (
    <div className="tp-card">
      <p className="tp-small tp-muted">
        面談で決めた種目を、その人の画面のメニューに足します。その曜日の「個人の追加」の行に入り(なければ最後)、トレ録の欄にも最初から入ります。見えるのは本人とトレーニング担当だけです。
      </p>
      <div className="tp-field">
        <label htmlFor="personal-member">部員</label>
        <select id="personal-member" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
          <option value="">選んでください</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
      </div>

      {memberId && items === null ? <p className="tp-small tp-muted">読み込み中…</p> : null}
      {items ? (
        items.length === 0 ? (
          <p className="tp-small tp-muted">まだ足した種目はありません。</p>
        ) : (
          <ul className="tp-list">
            {items.map((item) => (
              <li key={item.id}>
                <b>{item.name}</b> {item.dose}
                <span className="tp-sub">
                  {item.days.map((day) => TRAINING_DAY_LABELS[day]).join("・")}
                  {item.weighted ? "・重さを記録" : ""}
                  {item.tip ? `・${item.tip}` : ""}
                </span>{" "}
                <button
                  type="button"
                  className="tp-mini"
                  disabled={busy}
                  onClick={() => void send({ url: `${apiPath}&id=${encodeURIComponent(item.id)}`, method: "DELETE" })}
                >
                  消す
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {memberId ? (
        <form onSubmit={add}>
          <div className="tp-inputs">
            <div className="tp-field">
              <label htmlFor="personal-name">種目</label>
              <input
                id="personal-name"
                value={name}
                maxLength={PERSONAL_ITEM_LIMITS.name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例:メディシンボール 横投げ"
                required
              />
            </div>
            <div className="tp-field">
              <label htmlFor="personal-dose">回数・セット</label>
              <input
                id="personal-dose"
                value={dose}
                maxLength={PERSONAL_ITEM_LIMITS.dose}
                onChange={(event) => setDose(event.target.value)}
                placeholder="例:各側8回 × 3"
              />
            </div>
            <div className="tp-field">
              <label htmlFor="personal-tip">ひとこと(任意)</label>
              <input
                id="personal-tip"
                value={tip}
                maxLength={PERSONAL_ITEM_LIMITS.tip}
                onChange={(event) => setTip(event.target.value)}
                placeholder="例:左の肩甲骨を寄せる意識"
              />
            </div>
          </div>
          <div className="tp-field">
            <span>やる曜日</span>
            <div className="tp-chips">
              {TRAINING_DAYS.map((day) => (
                <label key={day} className="tp-check">
                  <input type="checkbox" checked={days.includes(day)} onChange={() => toggleDay(day)} />
                  {TRAINING_DAY_LABELS[day]}
                </label>
              ))}
            </div>
          </div>
          <label className="tp-check">
            <input type="checkbox" checked={weighted} onChange={(event) => setWeighted(event.target.checked)} />
            重さを記録する種目(トレ録で重さの欄を出す)
          </label>
          <div className="tp-actions">
            <button className="tp-button" type="submit" disabled={busy || !name.trim() || days.length === 0}>
              {busy ? "保存中…" : "足す"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="tp-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
