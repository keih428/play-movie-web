import type {
  ParsedMatch,
  ParsedPlay,
  SavedWorkspaceRecord,
  SavedWorkspaceSummary,
} from "@/lib/domain/types";

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

function isTodaiTeamName(name: string) {
  return name.includes("東京大学") || name.includes("東大");
}

export function getMatchSetScore(match: ParsedMatch) {
  return match.sets.reduce(
    (score, set) => {
      if (set.score.home > set.score.away) {
        return { ...score, home: score.home + 1 };
      }
      if (set.score.away > set.score.home) {
        return { ...score, away: score.away + 1 };
      }
      return score;
    },
    { home: 0, away: 0 },
  );
}

export function getMatchResultLabel(match: ParsedMatch): string {
  const setScore = getMatchSetScore(match);
  const homeIsTodai = isTodaiTeamName(match.teams.home.name);
  const awayIsTodai = isTodaiTeamName(match.teams.away.name);

  if (homeIsTodai || awayIsTodai) {
    const todaiScore = homeIsTodai ? setScore.home : setScore.away;
    const opponentScore = homeIsTodai ? setScore.away : setScore.home;

    if (todaiScore > opponentScore) {
      return "勝利";
    }
    if (todaiScore < opponentScore) {
      return "敗戦";
    }
    return "引き分け";
  }

  if (setScore.home > setScore.away) {
    return `${match.teams.home.name} 勝利`;
  }
  if (setScore.home < setScore.away) {
    return `${match.teams.away.name} 勝利`;
  }
  return "引き分け";
}

export function getWorkspacePrimaryMatch(workspace: SavedWorkspaceRecord) {
  return (
    workspace.collection.matches[workspace.selectedMatchIndex] ??
    workspace.collection.matches[0]
  );
}

export function enrichWorkspaceSummary(
  workspace: SavedWorkspaceRecord,
  summary: SavedWorkspaceSummary,
): SavedWorkspaceSummary {
  const match = getWorkspacePrimaryMatch(workspace);
  if (!match) {
    return summary;
  }

  const setScore = getMatchSetScore(match);
  return {
    ...summary,
    matchLabel: `${match.teams.home.name} vs ${match.teams.away.name}`,
    matchDate: match.startDate,
    resultLabel: getMatchResultLabel(match),
    setScoreLabel: `${setScore.home}-${setScore.away}`,
  };
}
