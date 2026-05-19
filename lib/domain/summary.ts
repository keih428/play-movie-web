import type { ParsedMatch, ParsedPlay, SavedWorkspaceRecord } from "@/lib/domain/types";

export function countMatchPlays(match: ParsedMatch): number {
  return match.sets.reduce(
    (sum, set) =>
      sum + set.events.reduce((inner, event) => inner + event.plays.length, 0),
    0,
  );
}

export function countWorkspacePlays(workspace: SavedWorkspaceRecord): number {
  return workspace.collection.matches.reduce(
    (sum, match) => sum + countMatchPlays(match),
    0,
  );
}

export function countWorkspaceSets(workspace: SavedWorkspaceRecord): number {
  return workspace.collection.matches.reduce(
    (sum, match) => sum + match.sets.length,
    0,
  );
}

export function countWorkspaceEvents(workspace: SavedWorkspaceRecord): number {
  return workspace.collection.matches.reduce(
    (sum, match) =>
      sum + match.sets.reduce((inner, set) => inner + set.events.length, 0),
    0,
  );
}

export function summarizeSkills(plays: ParsedPlay[]) {
  const counter = new Map<string, number>();

  plays.forEach((play) => {
    const key = play.skill ?? "unknown";
    counter.set(key, (counter.get(key) ?? 0) + 1);
  });

  return [...counter.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);
}

export function getTopSkillsForMatch(match: ParsedMatch, limit = 5) {
  const plays = match.sets.flatMap((set) => set.events.flatMap((event) => event.plays));
  return summarizeSkills(plays).slice(0, limit);
}
