export const PORTAL_TEAM_SLUGS = ["utvb"];

// 鉄壁(単語帳)の見た目に切り替えるトグルを出すかどうか。2026-10-13 からいったん止めている。
// 見た目そのもの(portal.css の data-mode="tango"、tp-tango-only の中身)は消していないので、true に戻せばそのまま使える。
export const TANGO_MODE_ENABLED = false;

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
  // 背番号(なければ null)。プレイヤーは数字、スタッフは T・M・C などの文字。
  number: string | null;
  // 画面と Slack に出す名前。背番号があれば前に付ける(15林)。
  displayName: string;
  grade: number | null;
  position: MemberPosition | null;
  isLeader: boolean;
  role: MemberRole;
  // システム担当(名簿・ログインの記録・Slack のテストを扱う)。役割とは別に持つので、トレーニング担当と兼ねられる。
  isSystemAdmin: boolean;
  title: string | null;
  tier: string | null;
  slot: string | null;
  slackId: string | null;
  active: boolean;
  sortOrder: number;
};

export type MemberInput = {
  name: string;
  // 背番号。undefined は「触らない」(取り込む表に背番号の列がないとき)、null は「番号なし」。
  number?: string | null;
  grade: number | null;
  position: MemberPosition | null;
  isLeader: boolean;
  role: MemberRole;
  // undefined は「触らない」(取り込む表で「システム担当」と書かれていない人)。
  isSystemAdmin?: boolean;
  title: string | null;
};

export type LoginChoice = Pick<Member, "id" | "displayName" | "grade" | "position" | "title">;

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

/** 背番号 + 名前(15林、T藤本)。背番号がなければ名前だけ。 */
export function formatMemberName(name: string, number: string | null | undefined): string {
  return number ? `${number}${name}` : name;
}

export const MEMBER_NUMBER_MAX_LENGTH = 4;

/** 背番号の欄に書かれたものを整える。空なら null、長すぎる・空白や記号が混じるものは受け付けない(undefined)。 */
export function normalizeMemberNumber(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).normalize("NFKC").trim();
  if (!text) {
    return null;
  }
  return text.length <= MEMBER_NUMBER_MAX_LENGTH && /^[\p{Letter}\p{Number}]+$/u.test(text)
    ? text
    : undefined;
}

/** 背番号の並び:数字は小さい順、そのあとに文字(T・M・C など)、背番号のない人は最後。 */
function compareMemberNumbers(left: string | null, right: string | null): number {
  const rank = (value: string | null) => (value === null ? 2 : /^\d+$/.test(value) ? 0 : 1);
  if (rank(left) !== rank(right)) {
    return rank(left) - rank(right);
  }
  if (left === null || right === null) {
    return 0;
  }
  return rank(left) === 0 ? Number(left) - Number(right) : left.localeCompare(right, "ja");
}

/** 名簿の並び:学年の上から、同じ学年の中は背番号の順。学年のない人(コーチなど)は最後。 */
export function sortMembers<T extends Pick<Member, "grade" | "number" | "sortOrder">>(members: T[]): T[] {
  return [...members].sort(
    (left, right) =>
      (right.grade ?? -1) - (left.grade ?? -1) ||
      compareMemberNumbers(left.number, right.number) ||
      left.sortOrder - right.sortOrder,
  );
}

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

export const SYSTEM_ADMIN_LABEL = "システム担当";

/** メニュー・練習日の例外を変えたり、ほかの人のノートを消したりできるのは、トレーニング担当だけ。 */
export function canAdminister(role: MemberRole): boolean {
  return role === "training_lead";
}

// 名簿の肩書がこれの人(トレーナー)は、ノートのまとめを出せる。
const TRAINER_TITLE = "トレーナー";

/**
 * バレーノートの月ごとのまとめ(PDF)を出せる人:トレーニング担当、トレーナー、ポジションのリーダー。
 * 副担当・ほかのスタッフ・ふつうの部員は出せない。
 */
export function canExportNotes(member: Pick<Member, "role" | "isLeader" | "title">): boolean {
  return canAdminister(member.role) || member.isLeader || member.title === TRAINER_TITLE;
}

/** 名簿を変える・Slack の知らせを試すのは、システム担当だけ。 */
export function canManageSite(member: Pick<Member, "isSystemAdmin">): boolean {
  return member.isSystemAdmin;
}

/** ログインの記録を見られるのも、システム担当だけ。 */
export function canViewLoginLog(member: Pick<Member, "isSystemAdmin">): boolean {
  return member.isSystemAdmin;
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

/**
 * 役割の欄を読む。「トレーニング担当・システム担当」のように、システム担当はほかの役割と並べて書ける。
 * システム担当と書かれていなければ isSystemAdmin は undefined(今の値を変えない)。
 */
function parseRole(cell: string): { role: MemberRole; title: string | null; isSystemAdmin?: boolean } {
  const parts = cell.split(/[・、,，\s]+/).filter(Boolean);
  const isSystemAdmin = parts.includes(SYSTEM_ADMIN_LABEL) ? true : undefined;
  const value = parts.filter((part) => part !== SYSTEM_ADMIN_LABEL).join("・");
  return { ...parseBaseRole(value), ...(isSystemAdmin ? { isSystemAdmin } : {}) };
}

function parseBaseRole(value: string): { role: MemberRole; title: string | null } {
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
 * 名簿の Markdown の表(背番号 | 名前 | 学年 | ポジション | リーダー | 役割)を読む。背番号の列は、なくてもよい。
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
    const { role, title, isSystemAdmin } = parseRole(read("役割"));
    const grade = Number.parseInt(read("学年"), 10);
    const hasNumberColumn = columns.includes("背番号");

    members.push({
      name,
      ...(hasNumberColumn ? { number: normalizeMemberNumber(read("背番号")) ?? null } : {}),
      grade: Number.isFinite(grade) ? grade : null,
      position,
      isLeader: /[◯○〇]/.test(read("リーダー")),
      role,
      ...(isSystemAdmin ? { isSystemAdmin } : {}),
      title: position ? title : positionCell || title,
    });
  }

  return members.filter(
    (member, index) => members.findIndex((entry) => entry.name === member.name) === index,
  );
}
