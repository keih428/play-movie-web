import { countMemberPlays, findOwnSide, getOwnSetScore } from "@/lib/domain/my-plays";
import { getWorkspacePrimaryMatch } from "@/lib/domain/summary";
import type { ParsedMatch, SavedWorkspaceRecord, TeamSide } from "@/lib/domain/types";
import { getSavedWorkspace, listSavedWorkspaces } from "@/lib/server/workspace-store";

export type MyMatchSummary = {
  workspaceId: string;
  date: string | null;
  opponent: string;
  setScore: { own: number; opponent: number };
  playCount: number;
};

export type MyMatch = MyMatchSummary & {
  record: SavedWorkspaceRecord;
  match: ParsedMatch;
  side: TeamSide;
};

/**
 * 部のチームが出ていて、その背番号の人がプレーしている試合(新しい順)。
 * 今は試合ごとの JSON を全部読む(試合の数が少ないうち。増えたら一覧用の索引を作る。改修計画の 2.)。
 */
export async function listMemberMatches(teamSlug: string, number: string): Promise<MyMatch[]> {
  const summaries = (await listSavedWorkspaces()).filter((summary) => summary.teamSlug === teamSlug);
  const records = await Promise.all(summaries.map((summary) => getSavedWorkspace(summary.id)));
  const matches: MyMatch[] = [];
  for (const record of records) {
    if (!record) {
      continue;
    }
    const match = getWorkspacePrimaryMatch(record);
    const side = match ? findOwnSide(match) : undefined;
    if (!match || !side) {
      continue;
    }
    const playCount = countMemberPlays(match, side, number);
    if (playCount === 0) {
      continue;
    }
    matches.push({
      workspaceId: record.id,
      date: match.startDate ?? record.createdAt ?? null,
      opponent: side === "home" ? match.teams.away.name : match.teams.home.name,
      setScore: getOwnSetScore(match, side),
      playCount,
      record,
      match,
      side,
    });
  }
  return matches.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
