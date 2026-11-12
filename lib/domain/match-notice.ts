import type { ParsedMatch } from "@/lib/domain/types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 試合の日(日本時間)を「6/24(水)」の形に。読めなければ null。 */
export function formatMatchDay(iso: string | undefined): string | null {
  if (!iso) {
    return null;
  }
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return null;
  }
  const japan = new Date(time + 9 * 60 * 60 * 1000);
  return `${japan.getUTCMonth() + 1}/${japan.getUTCDate()}(${WEEKDAYS[japan.getUTCDay()]})`;
}

/**
 * 試合ビューアに試合を登録したときに、Slack の試合のチャンネルに流す文(2026-11-12 から。けーいちの依頼)。
 * スタッフがバレステの .vsm と YouTube の動画を結び付けて登録したとき。打ち込み補助から保存した試合は流さない。
 */
export function formatMatchAddedMessage(input: {
  name: string;
  match: Pick<ParsedMatch, "startDate" | "teams"> | undefined;
  url: string;
}): string {
  const { match } = input;
  const day = formatMatchDay(match?.startDate);
  const teams = match ? `${match.teams.home.name} vs ${match.teams.away.name}` : null;
  const detail = [day, teams].filter(Boolean).join(" ");
  return [
    `🏐 試合ビューアに試合を追加しました:*${input.name}*`,
    ...(detail ? [detail] : []),
    `動画とプレーを見る → ${input.url}`,
  ].join("\n");
}
