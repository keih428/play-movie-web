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
      entry.name.trim().toLocaleLowerCase() === normalized ||
      entry.slug.toLocaleLowerCase() === normalized ||
      entry.code.toLocaleLowerCase() === normalized ||
      entry.aliases.some((alias) => alias.trim().toLocaleLowerCase() === normalized),
  );
}

export function areTeamNamesEquivalent(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  const normalizedLeft = left.trim().toLocaleLowerCase();
  const normalizedRight = right.trim().toLocaleLowerCase();
  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const leftEntry = findCatalogEntryByAlias(left);
  const rightEntry = findCatalogEntryByAlias(right);
  return Boolean(leftEntry && rightEntry && leftEntry.slug === rightEntry.slug);
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

export function buildTeamAnalysisPath(teamSlug: string): string {
  return `/t/${teamSlug}/analysis`;
}

export function buildTeamLoginPath(teamSlug: string): string {
  return `/t/${teamSlug}/login`;
}

// データベース/マニュアル(部のルール・役職の仕事・出欠のルールなど)。
export function buildTeamManualPath(teamSlug: string): string {
  return `/t/${teamSlug}/manual`;
}

// 部内ページのホーム(ポータル)。チームの目標と、各ページへの入口を並べる。
export function buildTeamHomePath(teamSlug: string): string {
  return `/t/${teamSlug}/home`;
}

export function buildTeamAttendancePath(teamSlug: string): string {
  return `/t/${teamSlug}/attendance`;
}

export function buildTeamSchedulePath(teamSlug: string): string {
  return `/t/${teamSlug}/schedule`;
}

// 監督など、ログインしない人に予定表だけを見せる共有リンク(2026-10-31 から)。token は推測できない長い文字列。
export const TEAM_SHARE_SECTION = "s";

export function buildTeamScheduleSharePath(teamSlug: string, token: string): string {
  return `/t/${teamSlug}/${TEAM_SHARE_SECTION}/${token}`;
}

export function buildTeamNotesPath(teamSlug: string): string {
  return `/t/${teamSlug}/notes`;
}

/** マイプレー(上のメニューの「試合」。自分のプレーの映像)。 */
export function buildTeamMyPlaysPath(teamSlug: string): string {
  return `/t/${teamSlug}/myplays`;
}

export function buildTeamTrainingPath(teamSlug: string): string {
  return `/t/${teamSlug}/training`;
}

export function buildTeamTrainingPlanPath(teamSlug: string): string {
  return `/t/${teamSlug}/training/plan`;
}

export function buildTeamTrainingRecordsPath(teamSlug: string): string {
  return `/t/${teamSlug}/training/team`;
}

/** 自分の合言葉を決める・決め直すページ(2026-10-25 から)。 */
export function buildTeamAccountPath(teamSlug: string): string {
  return `/t/${teamSlug}/account`;
}

export function buildTeamMembersPath(teamSlug: string): string {
  return `/t/${teamSlug}/members`;
}

/** 名簿のまとめて編集(システム担当だけ、2026-10-26 から)。 */
export function buildTeamMembersBulkEditPath(teamSlug: string): string {
  return `/t/${teamSlug}/members/edit`;
}

export function buildTeamLoginLogPath(teamSlug: string): string {
  return `/t/${teamSlug}/members/logins`;
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

  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}team=${encodeURIComponent(teamSlug)}`;
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
