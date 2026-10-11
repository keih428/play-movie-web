export const PORTAL_TEAM_SLUGS = ["utvb"];

export const MEMBER_POSITIONS = ["OH", "OP", "MB", "S", "Li"] as const;
export type MemberPosition = (typeof MEMBER_POSITIONS)[number];

export const MEMBER_ROLES = ["member", "training_lead", "training_sub", "staff"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_GROUPS = ["side", "MB", "S", "Li"] as const;
export type MemberGroup = (typeof MEMBER_GROUPS)[number];

export const MEMBER_TIERS = ["T0", "T1", "T2", "T3"] as const;
export const MEMBER_SLOTS = ["A", "B"] as const;

export type Member = {
  id: string;
  teamSlug: string;
  name: string;
  grade: number | null;
  position: MemberPosition | null;
  isLeader: boolean;
  role: MemberRole;
  title: string | null;
  tier: string | null;
  slot: string | null;
  slackId: string | null;
  active: boolean;
  sortOrder: number;
};

export type MemberInput = {
  name: string;
  grade: number | null;
  position: MemberPosition | null;
  isLeader: boolean;
  role: MemberRole;
  title: string | null;
};

export type LoginChoice = Pick<Member, "id" | "name" | "grade" | "position" | "title">;

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  member: "部員",
  training_lead: "トレーニング担当",
  training_sub: "トレーニング副担当",
  staff: "スタッフ",
};

export const MEMBER_GROUP_LABELS: Record<MemberGroup, string> = {
  side: "サイド",
  MB: "MB",
  S: "S",
  Li: "Li",
};

export function isPortalTeam(teamSlug: string | undefined): boolean {
  return Boolean(teamSlug && PORTAL_TEAM_SLUGS.includes(teamSlug));
}

export function isMemberPosition(value: unknown): value is MemberPosition {
  return MEMBER_POSITIONS.includes(value as MemberPosition);
}

export function isMemberRole(value: unknown): value is MemberRole {
  return MEMBER_ROLES.includes(value as MemberRole);
}

// OP は OH とセット(サイド)として扱う。リーダーへの通知とノートの振り分けに使う。
export function getMemberGroup(position: MemberPosition | null): MemberGroup | null {
  if (!position) {
    return null;
  }
  return position === "OH" || position === "OP" ? "side" : position;
}

export function canManageMembers(role: MemberRole): boolean {
  return role !== "member";
}

export function receivesTrainingNotices(role: MemberRole): boolean {
  return role === "training_lead" || role === "training_sub";
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseRole(value: string): { role: MemberRole; title: string | null } {
  if (value === "トレーニング担当") {
    return { role: "training_lead", title: null };
  }
  if (value === "トレーニング副担当") {
    return { role: "training_sub", title: null };
  }
  if (value === "スタッフ") {
    return { role: "staff", title: null };
  }
  return { role: "member", title: value || null };
}

/**
 * 名簿の Markdown の表(名前 | 学年 | ポジション | リーダー | 役割)を読む。
 * ポジションの欄が OH/OP/MB/S/Li 以外(トレーナー、コーチ など)の行は、それを肩書として持つ。
 */
export function parseRosterMarkdown(markdown: string): MemberInput[] {
  const members: MemberInput[] = [];
  let columns: string[] | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) {
      columns = null;
      continue;
    }

    const cells = splitTableRow(line);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue;
    }
    if (!columns) {
      columns = cells;
      continue;
    }
    if (!columns.includes("名前") || !columns.includes("ポジション")) {
      continue;
    }

    const read = (column: string) => cells[columns!.indexOf(column)] ?? "";
    const name = read("名前");
    if (!name) {
      continue;
    }

    const positionCell = read("ポジション");
    const position = isMemberPosition(positionCell) ? positionCell : null;
    const { role, title } = parseRole(read("役割"));
    const grade = Number.parseInt(read("学年"), 10);

    members.push({
      name,
      grade: Number.isFinite(grade) ? grade : null,
      position,
      isLeader: /[◯○〇]/.test(read("リーダー")),
      role,
      title: position ? title : positionCell || title,
    });
  }

  return members.filter(
    (member, index) => members.findIndex((entry) => entry.name === member.name) === index,
  );
}
