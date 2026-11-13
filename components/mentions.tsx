"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { filterMentionCandidates, findMentionQuery, splitMentions, type MentionMember } from "@/lib/domain/mentions";
import { LinkedText } from "@/components/linked-text";

/**
 * @ で部員を呼ぶ(メンション。2026-11-13 から)。名簿は部内ページの枠(layout.tsx)で1回読み、ここから配る。
 * ログインしていない画面では空。
 */
const MentionContext = createContext<{ members: MentionMember[]; currentId: string | null }>({
  members: [],
  currentId: null,
});

export function MentionProvider({
  members,
  currentId,
  children,
}: {
  members: MentionMember[];
  currentId: string | null;
  children: ReactNode;
}) {
  return <MentionContext.Provider value={{ members, currentId }}>{children}</MentionContext.Provider>;
}

/** コメント・返信の本文。「@15林」を色付きで出す。 */
export function MentionText({ text }: { text: string }) {
  const { members, currentId } = useContext(MentionContext);
  return (
    <>
      {splitMentions(text, members).map((segment, index) =>
        segment.memberId ? (
          <span key={index} className="tp-mention" data-me={segment.memberId === currentId ? "" : undefined}>
            {segment.text}
          </span>
        ) : (
          <LinkedText key={index} text={segment.text} />
        ),
      )}
    </>
  );
}

type MentionTextareaProps = {
  id: string;
  rows: number;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
};

/**
 * @ を打つと、下に部員の候補が出る欄。押すと「@15林 」が入る。候補は背番号・苗字・ポジション(S・MB…)で絞れる。
 * スマホでは @ が打ちにくいので、「@ で呼ぶ」ボタンでも始められる。候補は欄の下に並べる
 * (iPhone で浮かせた部品は崩れやすいため)。
 */
export function MentionTextarea({ id, rows, maxLength, value, onChange }: MentionTextareaProps) {
  const { members, currentId } = useContext(MentionContext);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);

  const active = caret === null ? null : findMentionQuery(value.slice(0, caret));
  const candidates = active
    ? filterMentionCandidates(
        members.filter((member) => member.id !== currentId),
        active.query,
      )
    : [];

  function syncCaret() {
    setCaret(ref.current?.selectionStart ?? null);
  }

  // 文字を入れたあとのカーソルの位置。画面が書き換わった直後(次の文字を打つ前)に置く。
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const position = pendingCaret.current;
    if (position !== null && ref.current) {
      pendingCaret.current = null;
      ref.current.focus();
      ref.current.setSelectionRange(position, position);
    }
  });

  function placeCaret(position: number) {
    pendingCaret.current = position;
    setCaret(position);
  }

  function pick(member: MentionMember) {
    // 覚えているカーソルの位置は、打った直後だと古いことがあるので、欄から読み直す。
    const at = ref.current?.selectionStart ?? caret;
    const typing = at === null ? null : findMentionQuery(value.slice(0, at));
    if (at === null || !typing) {
      return;
    }
    const inserted = `@${member.displayName} `;
    const next = `${value.slice(0, typing.start)}${inserted}${value.slice(at)}`.slice(0, maxLength);
    onChange(next);
    placeCaret(Math.min(typing.start + inserted.length, next.length));
  }

  function startMention() {
    const at = ref.current?.selectionStart ?? value.length;
    // 前が文字なら空白をはさむ(「おすすめは?@」でも候補は出るが、読みやすさのため)。
    const before = value.slice(0, at);
    const mark = before && !/\s$/.test(before) ? " @" : "@";
    const next = `${before}${mark}${value.slice(at)}`.slice(0, maxLength);
    onChange(next);
    placeCaret(Math.min(at + mark.length, next.length));
  }

  return (
    <>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
        }}
        onSelect={syncCaret}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onBlur={() => {
          // 候補を押す前に消えないよう、少し待ってから閉じる。
          window.setTimeout(() => {
            if (document.activeElement !== ref.current) {
              setCaret(null);
            }
          }, 200);
        }}
        required
      />
      {active ? (
        candidates.length > 0 ? (
          <ul className="tp-mention-list" role="listbox" aria-label="呼ぶ人を選ぶ">
            {candidates.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  // 押したときに欄からフォーカスが外れないように。
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(member)}
                >
                  <MemberAvatar name={member.displayName} number={member.number} />
                  <b>{member.displayName}</b>
                  <span className="tp-muted">
                    {[member.position, member.grade ? `${member.grade}年` : null].filter(Boolean).join("・")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tp-small tp-muted">「{active.query}」に当てはまる人がいません。</p>
        )
      ) : (
        <div>
          <button
            type="button"
            className="tp-mention-start"
            onMouseDown={(event) => event.preventDefault()}
            onClick={startMention}
          >
            @ で呼ぶ
          </button>
        </div>
      )}
    </>
  );
}
