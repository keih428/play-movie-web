import type { ParsedMatch, SavedWorkspaceSummary } from "@/lib/domain/types";

export type TeamOption = {
  name: string;
  slug: string;
};

export function slugifyTeamName(name: string): string {
  const slug = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "team";
}

export function getTeamOptionsForMatch(match: ParsedMatch | undefined): TeamOption[] {
  if (!match) {
    return [];
  }

  const options = [match.teams.home.name, match.teams.away.name].map((name) => ({
    name,
    slug: slugifyTeamName(name),
  }));

  return options.filter(
    (option, index) => options.findIndex((entry) => entry.slug === option.slug) === index,
  );
}

export function buildTeamRootPath(teamSlug: string): string {
  return `/t/${teamSlug}`;
}

export function buildTeamVideosPath(teamSlug: string): string {
  return `/t/${teamSlug}/videos`;
}

export function buildTeamDataLibraryPath(teamSlug: string): string {
  return `/t/${teamSlug}/staff/data-library`;
}

export function buildTeamStaffSettingsPath(teamSlug: string): string {
  return `/t/${teamSlug}/staff/settings`;
}

export function buildTeamWorkspacesPath(teamSlug: string): string {
  return `/t/${teamSlug}/workspaces`;
}

export function buildWorkspacePath(input: {
  teamSlug?: string;
  workspaceId: string;
}): string {
  if (input.teamSlug) {
    return `${buildTeamWorkspacesPath(input.teamSlug)}/${input.workspaceId}`;
  }

  return `/workspaces/${input.workspaceId}`;
}

export function buildTeamApiPath(pathname: string, teamSlug?: string): string {
  if (!teamSlug) {
    return pathname;
  }

  return `${pathname}?team=${encodeURIComponent(teamSlug)}`;
}

export function getWorkspaceSummaryPath(workspace: SavedWorkspaceSummary): string {
  return buildWorkspacePath({
    teamSlug: workspace.teamSlug,
    workspaceId: workspace.id,
  });
}

export function formatTeamSlugLabel(teamSlug: string): string {
  return teamSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}
