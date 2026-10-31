export const PORTAL_TEAM_SLUGS = ["utvb"];

// 鉄壁(単語帳)の見た目に切り替えるトグルを出すかどうか。2026-10-13 からいったん止めている。
// 見た目そのもの(portal.css の data-mode="tango"、tp-tango-only の中身)は消していない。
// トグルのボタンは、2026-10-20 に上のバーを1つにしたときに外した。戻すなら、git の履歴の components/portal-top-nav.tsx から上のバーに足す。
export const TANGO_MODE_ENABLED = false;

export const MEMBER_POSITIONS = ["OH", "OP", "MB", "S", "Li"] as const;
export type MemberPosition = (typeof MEMBER_POSITIONS)[number];

// 役割は部員かスタッフか。トレーニング担当・システム担当・ポジションのリーダーは、役割とは別の印(チェック)で持つ。
export const MEMBER_ROLES = ["member", "staff"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_GROUPS = ["side", "MB", "S", "Li"] as const;
export type MemberGroup = (typeof MEMBER_GROUPS)[number];

export const MEMBER_TIERS = ["T0", "T1", "T2", "T3"] as const;
// 名簿の枠。A と B はいつも一緒に動き(スタメンとそれ以外)、C は別に動く。
export const MEMBER_SLOTS = ["A", "B", "C"] as const;

// トレーニングのメニューと時間の分け方。A・B の人は AB(練習の前)、C の人は C(練習の後)。
// 2026-10-16 までの A/B を、AB/C と呼び直したもの(中身と時間は A→AB、B→C)。
export const TRAINING_GROUPS = ["AB", "C"] as const;
export type TrainingGroup = (typeof TRAINING_GROUPS)[number];

/** 名簿の枠から、トレーニングのまとまりを決める。枠が決まっていなければ null。 */
export function toTrainingGroup(slot: string | null | undefined): TrainingGroup | null {
  if (slot === "C") return "C";
  if (slot === "A" || slot === "B") return "AB";
  return null;
}

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
  // トレーニング担当(メニュー・☆・個人の追加メニュー・「トレーニング担当へ」を扱う。2026-11-01 にこれだけにした)。
  isTrainingLead: boolean;
  // システム担当(名簿・ログインの記録・Slack のテストを扱う)。トレーニング担当と兼ねられる。
  isSystemAdmin: boolean;
  // 幹部(主将・副将・主務など)。ホームの目標と、データベース/マニュアルを書き直せる(2026-10-20 から)。
  isExecutive: boolean;
  // 自分の合言葉を決めているか(2026-10-25 から)。合言葉そのものは画面に渡さない。
  hasPassphrase: boolean;
  // 自分の合言葉を決め直した回数。ログインのクッキーに入れて、決め直したら前のログインを無効にする。
  passphraseVersion: number;
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
  // undefined は「触らない」(取り込む表で「トレーニング担当」「システム担当」と書かれていない人)。
  isTrainingLead?: boolean;
  isSystemAdmin?: boolean;
  title: string | null;
};

export type LoginChoice = Pick<Member, "id" | "displayName" | "grade" | "position" | "title" | "hasPassphrase">;

// 自分の合言葉の長さ(部の合言葉とは別に、本人が決める)。
export const MEMBER_PASSPHRASE_MIN_LENGTH = 4;
export const MEMBER_PASSPHRASE_MAX_LENGTH = 64;

/** 自分の合言葉として使えるか。だめならその理由。 */
export function validateMemberPassphrase(value: string): string | null {
  const length = [...value.normalize("NFKC").trim()].length;
  if (length < MEMBER_PASSPHRASE_MIN_LENGTH) {
    return `合言葉は${MEMBER_PASSPHRASE_MIN_LENGTH}文字以上にしてください。`;
  }
  if (length > MEMBER_PASSPHRASE_MAX_LENGTH) {
    return `合言葉は${MEMBER_PASSPHRASE_MAX_LENGTH}文字までにしてください。`;
  }
  return null;
}

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  member: "部員",
  staff: "スタッフ",
};

export const TRAINING_LEAD_LABEL = "トレーニング担当";

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
export const EXECUTIVE_LABEL = "幹部";

/**
 * トレーニング担当の権限:メニュー・年間の方針を入れる、☆ を付ける、個人の追加メニュー、「トレーニング担当へ」の知らせと返信
 * (けーいちの決定、2026-11-01:トレーニング担当はこれだけ。ほかは外した)。
 */
export function canAdminister(member: Pick<Member, "isTrainingLead">): boolean {
  return member.isTrainingLead;
}

/**
 * ほかの人のノートを消す・今週のコメント当番の組み合わせを見る:システム担当
 * (2026-11-01 にトレーニング担当から移した)。
 */
export function canModerateNotes(member: Pick<Member, "isSystemAdmin">): boolean {
  return member.isSystemAdmin;
}

/** 練習日の例外(オフの日・いつもと違う練習日)を決める:システム担当(2026-11-01 にトレーニング担当から移した)。 */
export function canEditPracticeDays(member: Pick<Member, "isSystemAdmin">): boolean {
  return member.isSystemAdmin;
}

// 名簿の肩書がこれの人(トレーナー)は、ノートのまとめを出せる。
const TRAINER_TITLE = "トレーナー";

/**
 * バレーノートの月ごとのまとめ(PDF)を出せる人:トレーナー、ポジションのリーダー(2026-11-01 にトレーニング担当を外した)。
 * 副担当・ほかのスタッフ・ふつうの部員は出せない。
 */
export function canExportNotes(member: Pick<Member, "isLeader" | "title">): boolean {
  return member.isLeader || member.title === TRAINER_TITLE;
}

// 部内ページの文章の種類。goal はホームに大きく出すチームの目標。ほかはデータベース/マニュアルの見出しごとの文章。
export const PORTAL_TEXT_KEYS = ["goal", "policy", "rules", "attendance", "roles", "manual", "training"] as const;
type PortalSectionKey = (typeof PORTAL_TEXT_KEYS)[number];

/**
 * 役職ごとのマニュアル(2026-11-01 から)。1つの役職に1つの文章で、部員なら**だれでも**書き直せる
 * (けーいちの決定:「編集可能な人は、全員です」)。保存するときの key は `role-<id>`。
 */
export const ROLE_MANUALS = [
  { id: "training", title: "トレーニング担当" },
  { id: "system", title: "システム担当" },
  { id: "gym", title: "体育館係" },
  { id: "liaison", title: "渉外" },
  { id: "standing", title: "常務" },
  { id: "general", title: "総務" },
  { id: "pr", title: "広報" },
  { id: "federation", title: "学連" },
  { id: "accounting", title: "会計" },
  { id: "order", title: "注文" },
  { id: "secretary", title: "主務" },
  { id: "video", title: "動画" },
  { id: "cheer", title: "エール" },
] as const;
export type RoleManualKey = `role-${(typeof ROLE_MANUALS)[number]["id"]}`;

export const roleManualKey = (id: (typeof ROLE_MANUALS)[number]["id"]): RoleManualKey => `role-${id}`;

export function isRoleManualKey(value: unknown): value is RoleManualKey {
  return typeof value === "string" && ROLE_MANUALS.some((role) => `role-${role.id}` === value);
}

export type PortalTextKey = PortalSectionKey | RoleManualKey;

export function isPortalTextKey(value: unknown): value is PortalTextKey {
  return PORTAL_TEXT_KEYS.includes(value as PortalSectionKey) || isRoleManualKey(value);
}
export const PORTAL_TEXT_MAX_LENGTH = 10000;

/**
 * データベース/マニュアルの見出し(部員の声、2026-10-20)。中身は幹部が書く。
 * hint は、まだ書かれていないときに出す「何を書くか」の目安。
 */
export const MANUAL_SECTIONS: { key: Exclude<PortalSectionKey, "goal">; title: string; hint: string }[] = [
  { key: "policy", title: "チームとして目指す方針", hint: "1年の目標、大事にすること、目指すチームの姿" },
  { key: "rules", title: "部のルール", hint: "練習・試合・部室・連絡などの決まり" },
  {
    key: "attendance",
    title: "出欠・遅刻のルール",
    hint: "いつまでに入力するか、変えるときどうするか、遅刻・早退・欠席するときの決まりと注意",
  },
  { key: "roles", title: "役職ごとの仕事内容・引き継ぎ", hint: "役職ごとの仕事、時期ごとにやること、引き継ぐこと" },
  // 2026-11-01 に「部内マニュアル」から名前を変えた(key はそのまま)。
  { key: "manual", title: "マネマニュアル", hint: "練習の準備・片付け、遠征、会計など、やり方の手順" },
  { key: "training", title: "筋トレの内容・推奨メニュー", hint: "筋トレの考え方、推奨メニュー、自分でメニューを組むときの目安" },
];

/**
 * データベース/マニュアルを書き直せる人:幹部とシステム担当(2026-11-01 にトレーニング担当を外した)
 * (けーいちの決定、2026-10-20:「幹部が書いて、サイトで直せる」)。幹部の印は名簿で付ける。
 * ホームのチームの目標は、幹部だけ(canEditTeamGoal)。
 */
export function canEditPortalTexts(member: Pick<Member, "isSystemAdmin" | "isExecutive">): boolean {
  return member.isExecutive || member.isSystemAdmin;
}

/** ホームのチームの目標を書けるのは、幹部だけ(けーいちの決定、2026-10-31:「トレーニング担当とシステム担当は目標を書き込める必要ない」)。 */
export function canEditTeamGoal(member: Pick<Member, "isExecutive">): boolean {
  return member.isExecutive;
}

/** チームの月間マイルストーンを決めるのは、幹部だけ(けーいちの決定、2026-10-31)。 */
export function canSetTeamMilestone(member: Pick<Member, "isExecutive">): boolean {
  return member.isExecutive;
}

/** 名簿を変える・Slack の知らせを試すのは、システム担当だけ。 */
export function canManageSite(member: Pick<Member, "isSystemAdmin">): boolean {
  return member.isSystemAdmin;
}

/**
 * 名簿の「枠」を直せる人(けーいちの決定、2026-10-31:「ポジションリーダーも枠を編集できるように」)。
 * システム担当は全員の枠を、ポジションのリーダーは自分のまとまりの部員の枠だけを直せる(OH のリーダーは OP も)。
 */
export function canEditMemberSlot(
  current: Pick<Member, "isSystemAdmin" | "isLeader" | "position">,
  target: Pick<Member, "position">,
): boolean {
  if (canManageSite(current)) {
    return true;
  }
  const group = getMemberGroup(current.position);
  return current.isLeader && group !== null && getMemberGroup(target.position) === group;
}

/** 名簿のまとめて編集を開ける人:システム担当(全部の項目)と、ポジションのリーダー(枠だけ)。 */
export function canOpenMembersBulkEdit(member: Pick<Member, "isSystemAdmin" | "isLeader" | "position">): boolean {
  return canManageSite(member) || (member.isLeader && getMemberGroup(member.position) !== null);
}

/** ログインの記録を見られるのも、システム担当だけ。 */
export function canViewLoginLog(member: Pick<Member, "isSystemAdmin">): boolean {
  return member.isSystemAdmin;
}

export function receivesTrainingNotices(member: Pick<Member, "isTrainingLead">): boolean {
  return member.isTrainingLead;
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
 * 役割の欄を読む。「スタッフ」「トレーニング担当」「システム担当」は「・」で並べて書ける(例:トレーニング担当・システム担当)。
 * それ以外の言葉は肩書になる。トレーニング担当・システム担当は、書かれていなければ undefined(今の値を変えない)。
 * 「トレーニング副担当」は 2026-10-16 になくしたので、書かれていても読み飛ばす。
 */
function parseRole(cell: string): {
  role: MemberRole;
  title: string | null;
  isTrainingLead?: boolean;
  isSystemAdmin?: boolean;
} {
  const parts = cell.split(/[・、,，\s]+/).filter(Boolean);
  const flags = new Set([TRAINING_LEAD_LABEL, SYSTEM_ADMIN_LABEL, "スタッフ", "部員", "トレーニング副担当"]);
  const title = parts.filter((part) => !flags.has(part)).join("・");
  return {
    role: parts.includes("スタッフ") ? "staff" : "member",
    title: title || null,
    ...(parts.includes(TRAINING_LEAD_LABEL) ? { isTrainingLead: true } : {}),
    ...(parts.includes(SYSTEM_ADMIN_LABEL) ? { isSystemAdmin: true } : {}),
  };
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
    const { role, title, isTrainingLead, isSystemAdmin } = parseRole(read("役割"));
    const grade = Number.parseInt(read("学年"), 10);
    const hasNumberColumn = columns.includes("背番号");

    members.push({
      name,
      ...(hasNumberColumn ? { number: normalizeMemberNumber(read("背番号")) ?? null } : {}),
      grade: Number.isFinite(grade) ? grade : null,
      position,
      isLeader: /[◯○〇]/.test(read("リーダー")),
      role,
      ...(isTrainingLead ? { isTrainingLead } : {}),
      ...(isSystemAdmin ? { isSystemAdmin } : {}),
      title: position ? title : positionCell || title,
    });
  }

  return members.filter(
    (member, index) => members.findIndex((entry) => entry.name === member.name) === index,
  );
}
