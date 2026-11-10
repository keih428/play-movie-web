import type { MemberPosition } from "@/lib/domain/portal";

// ---------- サーブ効果率の集計(2026-11-10 から。主将の依頼) ----------
// サーブを打つたびに「エース」「効果」「入った(それ以外)」「ミス」のどれかを数え、
// 月ごとに AB・C に分けてサーブ効果率の順位を出す。打つのはリベロ以外のプレイヤーで、前半・後半に分かれて打つ。
// サーブ効果率 =(エース × 100 + 効果 × 25 − ミス × 25)÷ 打数

export const SERVE_RESULTS = ["ace", "effect", "in", "miss"] as const;
export type ServeResult = (typeof SERVE_RESULTS)[number];

export const SERVE_RESULT_LABELS: Record<ServeResult, string> = {
  ace: "エース",
  effect: "効果",
  in: "入った",
  miss: "ミス",
};

/**
 * 「効果」の基準(2026-11-10、けーいちの決定)。相手のレセプションが Cパス以下(DataVolley の +)か、
 * 直接返ってきた(/)サーブ。Bパス(!)・Aパス(-)は「入った」。Vリーグの「サーブ効果」に合わせた。
 */
export const SERVE_EFFECT_RULE = "効果 = 相手のレセプションが Cパス以下か、直接返ってきた。Bパス・Aパスは「入った」";

/** 月の順位に載る打数(月20本以上。スパイク・レセプションにそろえた)。 */
export const SERVE_MIN_ATTEMPTS = 20;

export type ServeTally = Record<ServeResult, number>;

export type ServeCount = ServeTally & {
  memberId: string;
};

export function emptyServeTally(): ServeTally {
  return { ace: 0, effect: 0, in: 0, miss: 0 };
}

export function isServeResult(value: unknown): value is ServeResult {
  return SERVE_RESULTS.includes(value as ServeResult);
}

/** 打数(エース・効果・入った・ミスの合計)。 */
export function serveAttempts(tally: ServeTally): number {
  return tally.ace + tally.effect + tally.in + tally.miss;
}

/** サーブ効果率(%)。打数が0なら null。 */
export function serveEfficiency(tally: ServeTally): number | null {
  const attempts = serveAttempts(tally);
  return attempts === 0 ? null : (tally.ace * 100 + tally.effect * 25 - tally.miss * 25) / attempts;
}

export function formatServeEfficiency(tally: ServeTally): string {
  const value = serveEfficiency(tally);
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/** 打つ人:リベロ以外のプレイヤー。 */
export function isServer(position: MemberPosition | null): boolean {
  return Boolean(position) && position !== "Li";
}

export type ServeRow = ServeCount & {
  attempts: number;
  // 規定の打数に届いていれば順位(同じ効果率は同じ順位)、届かなければ null(対象外)。
  rank: number | null;
};

/** サーブ効果率の順位。効果率の高い順で、規定の打数に届かない人は下に「対象外」。 */
export function rankServes(counts: ServeCount[], minAttempts = SERVE_MIN_ATTEMPTS): ServeRow[] {
  const byMember = new Map<string, ServeRow>();
  for (const entry of counts) {
    const row = byMember.get(entry.memberId) ?? { memberId: entry.memberId, ...emptyServeTally(), attempts: 0, rank: null };
    for (const result of SERVE_RESULTS) {
      row[result] += entry[result];
    }
    row.attempts = serveAttempts(row);
    byMember.set(entry.memberId, row);
  }
  // 比べるときは割り算をせず、分子 × 相手の打数 で比べる(小数のずれで同じ順位が分かれないように)。
  const points = (row: ServeRow) => row.ace * 100 + row.effect * 25 - row.miss * 25;
  const compare = (a: ServeRow, b: ServeRow) => points(b) * a.attempts - points(a) * b.attempts;
  const rows = [...byMember.values()].filter((row) => row.attempts > 0);
  const qualified = (row: ServeRow) => row.attempts >= minAttempts;
  rows.sort((a, b) => Number(qualified(b)) - Number(qualified(a)) || compare(a, b) || b.attempts - a.attempts);
  let previous: ServeRow | null = null;
  rows.forEach((row, index) => {
    if (!qualified(row)) {
      return;
    }
    row.rank = previous && compare(previous, row) === 0 ? previous.rank : index + 1;
    previous = row;
  });
  return rows;
}

// ---------- 数える画面:前半・後半 ----------

export type ServeTeam = "first" | "second";

export const SERVE_TEAM_LABELS: Record<ServeTeam, string> = {
  first: "前半",
  second: "後半",
};

// 前半・後半に分けるときのポジションの順(リベロは打たない)。
const SPLIT_POSITIONS = ["OH", "OP", "MB", "S"] as const satisfies readonly MemberPosition[];

/** 前半・後半を、ポジションごとに交互に分ける(どちらにも OH・OP・MB・S が入るように)。選手は渡した順に振り分ける。 */
export function splitServeTeams(players: { id: string; position: MemberPosition | null }[]): Record<string, ServeTeam> {
  const teams: Record<string, ServeTeam> = {};
  const sizes: Record<ServeTeam, number> = { first: 0, second: 0 };
  for (const position of SPLIT_POSITIONS) {
    let next: ServeTeam = sizes.first <= sizes.second ? "first" : "second";
    for (const player of players.filter((entry) => entry.position === position)) {
      teams[player.id] = next;
      sizes[next] += 1;
      next = next === "first" ? "second" : "first";
    }
  }
  return teams;
}

export type ServeSetup = {
  // 打つ人と、前半・後半。入っていない人は出ない。
  teams: Record<string, ServeTeam>;
};

const MAX_SETUP_ENTRIES = 200;

/** 組み方を読む(形の合わないところは捨てる)。読めなければ null。 */
export function parseServeSetup(value: unknown): ServeSetup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = (value as { teams?: unknown }).teams;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const teams: Record<string, ServeTeam> = {};
  for (const [id, team] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_SETUP_ENTRIES)) {
    if (team === "first" || team === "second") {
      teams[id] = team;
    }
  }
  return { teams };
}
