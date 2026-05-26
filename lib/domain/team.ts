import type { ParsedMatch, SavedWorkspaceSummary } from "@/lib/domain/types";
import { TEAM_CATALOG } from "@/lib/domain/team-catalog";

export type TeamOption = {
  name: string;
  slug: string;
};

function findCatalogEntryByAlias(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return TEAM_CATALOG.find(
    (entry) =>
      entry.slug.toLocaleLowerCase() === normalized ||
      entry.code.toLocaleLowerCase() === normalized ||
      entry.aliases.some((alias) => alias.trim().toLocaleLowerCase() === normalized),
  );
}

export function slugifyTeamName(name: string): string {
  const catalogEntry = findCatalogEntryByAlias(name);
  if (catalogEntry) {
    return catalogEntry.slug;
  }

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
  const catalogEntry = findCatalogEntryByAlias(teamSlug);
  if (catalogEntry) {
    return catalogEntry.name;
  }

  return teamSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}
