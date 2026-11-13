import type { Member } from "@/lib/domain/portal";

/**
 * ノートのコメントと、トレ録の「トレーニング担当へ」の返信で、@ で部員を呼ぶ(メンション。2026-11-13 から。けーいちの依頼)。
 * 本文には「@15林」のように表示名(背番号+苗字)のまま入れ、読むときと知らせるときに名簿と突き合わせる。
 * 呼ばれた人には Slack で知らせ、そのやりとりの参加者になる(トレ録の返信も書けるようになる)。
 */
export type MentionMember = Pick<Member, "id" | "name" | "displayName" | "number" | "position" | "grade">;

export type MentionSegment = { text: string; memberId?: string };

// 全角の「＠」も受ける(日本語のキーボードで打つと全角になることがある)。
const MARKS = ["@", "＠"];

/**
 * @ のあとの文字と名簿を突き合わせる鍵。表示名(15林)と、背番号のない人もいるので苗字だけ(林)も。
 * 苗字だけは、同じ苗字の人が1人のときに限る(誰のことか分からなくなるため)。
 */
function buildKeys(members: MentionMember[]): { key: string; memberId: string }[] {
  const surnameCount = new Map<string, number>();
  for (const member of members) {
    surnameCount.set(member.name, (surnameCount.get(member.name) ?? 0) + 1);
  }
  const keys: { key: string; memberId: string }[] = [];
  for (const member of members) {
    keys.push({ key: member.displayName, memberId: member.id });
    if (member.name !== member.displayName && surnameCount.get(member.name) === 1) {
      keys.push({ key: member.name, memberId: member.id });
    }
  }
  // 「@15林さん」のように名前のあとに文字が続くので、長い鍵から当てる(「1」より「15林」を先に)。
  return keys.filter((entry) => entry.key).sort((left, right) => right.key.length - left.key.length);
}

/** 本文を、ふつうの文字と「@名前」に分ける。名簿にない @ はふつうの文字のまま。 */
export function splitMentions(text: string, members: MentionMember[]): MentionSegment[] {
  const keys = buildKeys(members);
  const segments: MentionSegment[] = [];
  let plain = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const hit = MARKS.includes(char) ? keys.find((entry) => text.startsWith(entry.key, index + 1)) : undefined;
    if (hit) {
      if (plain) {
        segments.push({ text: plain });
        plain = "";
      }
      segments.push({ text: `${char}${hit.key}`, memberId: hit.memberId });
      index += 1 + hit.key.length;
    } else {
      plain += char;
      index += 1;
    }
  }
  if (plain) {
    segments.push({ text: plain });
  }
  return segments;
}

/** 本文で呼ばれている部員(同じ人は1回)。 */
export function findMentionedIds(text: string, members: MentionMember[]): string[] {
  return [
    ...new Set(
      splitMentions(text, members)
        .map((segment) => segment.memberId)
        .filter((memberId): memberId is string => Boolean(memberId)),
    ),
  ];
}

/**
 * 打っている途中の「@〇〇」(カーソルの前)。候補を出すのに使う。なければ null。
 * start は @ の位置。空白をはさんだら終わり。
 */
export function findMentionQuery(textBeforeCaret: string): { start: number; query: string } | null {
  const match = /[@＠]([^\s@＠]{0,10})$/.exec(textBeforeCaret);
  return match ? { start: match.index, query: match[1] } : null;
}

/**
 * 候補の絞り込み。表示名・苗字のほか、背番号の頭・ポジション(S・MB…)でも引ける。
 * 「@S」でセッターがまとめて出るように(セッターの上級生に聞きたい、という使い方から)。並びは名簿の順のまま。
 */
export function filterMentionCandidates<T extends MentionMember>(members: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return members.slice(0, limit);
  }
  return members
    .filter(
      (member) =>
        member.displayName.toLowerCase().includes(q) ||
        member.name.toLowerCase().includes(q) ||
        (member.number ?? "").toLowerCase().startsWith(q) ||
        (member.position ?? "").toLowerCase() === q,
    )
    .slice(0, limit);
}

/** やりとりの参加者:これまでに書いた人と、その中で @ で呼ばれた人(同じ人は1回)。 */
export function listThreadParticipantIds(
  posts: { authorId: string; body: string }[],
  members: MentionMember[],
): string[] {
  return [...new Set(posts.flatMap((post) => [post.authorId, ...findMentionedIds(post.body, members)]))];
}
