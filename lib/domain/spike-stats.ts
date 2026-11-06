import type { MemberPosition } from "@/lib/domain/portal";

// ---------- スパイク練習の集計(2026-11-06 から) ----------
// 決まりは vault の「ドリル_スパイク練習.pdf」(主将の資料)。選手ごと・トスを上げたセッターごとに「決定」と「打数」を数え、
// 月ごとにスパイカーとセッターの順位を出す。前衛 OH・OP はサーブを受けてから打つので、サーブのレベル別に分ける。
// レベルは名簿で1人ずつ決める(members.serve_level。全員 Lv1 から。2026-11-07 から。それまでは練習の成績で自動で上げていた)。

export const SPIKE_SPOTS = ["OH", "OP", "MB", "pipe", "shoot", "high_left", "high_right"] as const;
export type SpikeSpot = (typeof SPIKE_SPOTS)[number];

export const SPIKE_SPOT_LABELS: Record<SpikeSpot, string> = {
  OH: "前衛OH",
  OP: "前衛OP",
  MB: "前衛MB",
  pipe: "パイプ",
  shoot: "シャー",
  high_left: "二段トス・レフト",
  high_right: "二段トス・ライト",
};

/** 前衛の位置。選手のポジションで決まり、チーム戦・セッター戦(ペナルティ)はここだけで数える。 */
export const FRONT_SPOTS = ["OH", "OP", "MB"] as const satisfies readonly SpikeSpot[];
export type FrontSpot = (typeof FRONT_SPOTS)[number];

/** 数える画面の上で選ぶ「種目」。前衛はひとまとめ(1人ずつの位置はポジションから)。 */
export const SPIKE_MODES = ["front", "pipe", "shoot", "high_left", "high_right"] as const;
export type SpikeMode = (typeof SPIKE_MODES)[number];

export const SPIKE_MODE_LABELS: Record<SpikeMode, string> = {
  front: "前衛",
  pipe: "パイプ",
  shoot: "シャー",
  high_left: "二段L",
  high_right: "二段R",
};

/** サーブのレベル。0 は「サーブなし」(MB・パイプ・二段など)。 */
export const SERVE_LEVELS = [1, 2, 3] as const;
export type ServeLevel = (typeof SERVE_LEVELS)[number];
export type SpikeLevel = 0 | ServeLevel;

export const SERVE_LEVEL_LABELS: Record<ServeLevel, string> = {
  1: "逆回転",
  2: "スタンディングフローター",
  3: "ジャンプフローター",
};

/** 月の順位に載る打数(月間20打以上)。 */
export const SPIKE_MIN_ATTEMPTS = 20;

export type SpikeCount = {
  memberId: string;
  setterId: string;
  spot: SpikeSpot;
  level: SpikeLevel;
  kills: number;
  attempts: number;
};

export function isSpikeSpot(value: unknown): value is SpikeSpot {
  return SPIKE_SPOTS.includes(value as SpikeSpot);
}

/** サーブを受けてから打つ位置(前衛 OH・OP)。ここだけレベルを持つ。 */
export function hasServeLevel(spot: SpikeSpot): boolean {
  return spot === "OH" || spot === "OP";
}

/** 位置に合わせてレベルを整える(サーブのない位置は 0、ある位置で 1〜3 以外なら null)。 */
export function normalizeSpikeLevel(spot: SpikeSpot, value: unknown): SpikeLevel | null {
  if (!hasServeLevel(spot)) {
    return 0;
  }
  return SERVE_LEVELS.includes(value as ServeLevel) ? (value as ServeLevel) : null;
}

/** 前衛で、その選手が打つ位置(ポジションから)。セッター・リベロは打たないので null。 */
export function frontSpotOf(position: MemberPosition | null): FrontSpot | null {
  return position === "OH" || position === "OP" || position === "MB" ? position : null;
}

/** 種目と、その選手の前衛の位置から、数える位置を決める。 */
export function spotFor(mode: SpikeMode, front: FrontSpot | null): SpikeSpot | null {
  return mode === "front" ? front : mode;
}

export function spikeRate(kills: number, attempts: number): number | null {
  return attempts === 0 ? null : Math.round((kills / attempts) * 1000) / 10;
}

export function formatSpikeRate(kills: number, attempts: number): string {
  const rate = spikeRate(kills, attempts);
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

export type KillsAttempts = { kills: number; attempts: number };

export function sumCounts(counts: Pick<SpikeCount, "kills" | "attempts">[]): KillsAttempts {
  return counts.reduce(
    (sum, entry) => ({ kills: sum.kills + entry.kills, attempts: sum.attempts + entry.attempts }),
    { kills: 0, attempts: 0 },
  );
}

// ---------- 月の順位 ----------

export type SpikerRow = {
  memberId: string;
  bySetter: Map<string, KillsAttempts>;
  kills: number;
  attempts: number;
  // 規定打数に届いていれば順位(同じ決定率は同じ順位)、届かなければ null(対象外)。
  rank: number | null;
};

export type SpikerTable = {
  spot: SpikeSpot;
  level: SpikeLevel;
  rows: SpikerRow[];
};

/** スパイカーの月の順位。位置ごと(OH・OP はレベルごと)に表を分け、決定率の高い順。規定打数に届かない人は下に「対象外」。 */
export function rankSpikers(counts: SpikeCount[], minAttempts = SPIKE_MIN_ATTEMPTS): SpikerTable[] {
  const tables: SpikerTable[] = [];
  for (const spot of SPIKE_SPOTS) {
    const levels: SpikeLevel[] = hasServeLevel(spot) ? [3, 2, 1] : [0];
    for (const level of levels) {
      const entries = counts.filter((entry) => entry.spot === spot && entry.level === level);
      if (entries.length === 0) {
        continue;
      }
      const byMember = new Map<string, SpikerRow>();
      for (const entry of entries) {
        const row = byMember.get(entry.memberId) ?? {
          memberId: entry.memberId,
          bySetter: new Map(),
          kills: 0,
          attempts: 0,
          rank: null,
        };
        const setter = row.bySetter.get(entry.setterId) ?? { kills: 0, attempts: 0 };
        setter.kills += entry.kills;
        setter.attempts += entry.attempts;
        row.bySetter.set(entry.setterId, setter);
        row.kills += entry.kills;
        row.attempts += entry.attempts;
        byMember.set(entry.memberId, row);
      }
      const rows = [...byMember.values()].filter((row) => row.attempts > 0);
      const qualified = (row: SpikerRow) => row.attempts >= minAttempts;
      rows.sort(
        (a, b) =>
          Number(qualified(b)) - Number(qualified(a)) ||
          b.kills / b.attempts - a.kills / a.attempts ||
          b.attempts - a.attempts,
      );
      let previous: SpikerRow | null = null;
      rows.forEach((row, index) => {
        if (!qualified(row)) {
          return;
        }
        row.rank =
          previous && previous.kills * row.attempts === row.kills * previous.attempts ? previous.rank : index + 1;
        previous = row;
      });
      if (rows.length > 0) {
        tables.push({ spot, level, rows });
      }
    }
  }
  return tables;
}

export type SetterRanking = {
  setterIds: string[];
  // 位置 → セッター → 決定/打数
  bySpot: Map<SpikeSpot, Map<string, KillsAttempts>>;
  totals: Map<string, KillsAttempts>;
  ranks: Map<string, number>;
};

/** セッターの月の順位。トスを上げたスパイクの位置ごとに決定と打数を数え、合計の決定率で並べる。 */
export function rankSetters(counts: SpikeCount[]): SetterRanking {
  const bySpot = new Map<SpikeSpot, Map<string, KillsAttempts>>();
  const totals = new Map<string, KillsAttempts>();
  for (const entry of counts) {
    const spotMap = bySpot.get(entry.spot) ?? new Map<string, KillsAttempts>();
    const cell = spotMap.get(entry.setterId) ?? { kills: 0, attempts: 0 };
    cell.kills += entry.kills;
    cell.attempts += entry.attempts;
    spotMap.set(entry.setterId, cell);
    bySpot.set(entry.spot, spotMap);
    const total = totals.get(entry.setterId) ?? { kills: 0, attempts: 0 };
    total.kills += entry.kills;
    total.attempts += entry.attempts;
    totals.set(entry.setterId, total);
  }
  const rateOf = (id: string) => {
    const total = totals.get(id)!;
    return total.attempts ? total.kills / total.attempts : -1;
  };
  const setterIds = [...totals.keys()].filter((id) => totals.get(id)!.attempts > 0).sort((a, b) => rateOf(b) - rateOf(a));
  const ranks = new Map<string, number>();
  setterIds.forEach((id, index) => {
    const previous = setterIds[index - 1];
    ranks.set(id, previous !== undefined && rateOf(previous) === rateOf(id) ? ranks.get(previous)! : index + 1);
  });
  return { setterIds, bySpot, totals, ranks };
}

// ---------- 数える画面:チーム分け ----------

export type SpikeTeam = "first" | "second";

export const SPIKE_TEAM_LABELS: Record<SpikeTeam, string> = {
  first: "前半",
  second: "後半",
};

/**
 * 前半・後半の攻撃チームを、ポジションごとに交互に分ける(「ある程度均等に」。OH・MB・OP がそれぞれ両方に入る)。
 * 選手は渡した順(名簿の順)に振り分ける。
 */
export function splitSpikeTeams(players: { id: string; position: MemberPosition | null }[]): Record<string, SpikeTeam> {
  const teams: Record<string, SpikeTeam> = {};
  const sizes: Record<SpikeTeam, number> = { first: 0, second: 0 };
  for (const position of FRONT_SPOTS) {
    const group = players.filter((player) => player.position === position);
    // 人数の少ないほうから入れる(端数がどちらかに偏り続けないように)。
    let next: SpikeTeam = sizes.first <= sizes.second ? "first" : "second";
    for (const player of group) {
      teams[player.id] = next;
      sizes[next] += 1;
      next = next === "first" ? "second" : "first";
    }
  }
  return teams;
}

// ---------- 組み方(メニューごとに共有する。2026-11-06 から) ----------

/** 1つの画面に並べるセッターの数の上限(同時に何人かが上げるため)。 */
export const SPIKE_MAX_SHOWN_SETTERS = 3;

export type SpikeSetup = {
  // 打つ人と、その人の攻撃チーム。入っていない人は出ない。
  teams: Record<string, SpikeTeam>;
  // このメニューでトスを上げるセッター。
  setters: string[];
};

const MAX_SETUP_ENTRIES = 200;

/** 組み方を読む(形の合わないところは捨てる)。読めなければ null。 */
export function parseSpikeSetup(value: unknown): SpikeSetup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Partial<Record<keyof SpikeSetup, unknown>>;
  const entries = (record: unknown) =>
    record && typeof record === "object" && !Array.isArray(record)
      ? Object.entries(record as Record<string, unknown>).slice(0, MAX_SETUP_ENTRIES)
      : [];
  const teams: Record<string, SpikeTeam> = {};
  for (const [id, team] of entries(raw.teams)) {
    if (team === "first" || team === "second") {
      teams[id] = team;
    }
  }
  const setters = Array.isArray(raw.setters)
    ? [...new Set(raw.setters.filter((id): id is string => typeof id === "string"))].slice(0, MAX_SETUP_ENTRIES)
    : [];
  return { teams, setters };
}

/** 画面に並べるセッターを1人足す・外す。上限を超えたら、いちばん前に選んだ人を外す。 */
export function toggleShownSetter(shown: string[], id: string, max = SPIKE_MAX_SHOWN_SETTERS): string[] {
  if (shown.includes(id)) {
    return shown.filter((entry) => entry !== id);
  }
  const next = [...shown, id];
  return next.length > max ? next.slice(next.length - max) : next;
}
