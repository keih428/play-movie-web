import {
  buildAttackCourseRows,
  buildAttackMetricRows,
  buildReceptionMetricRows,
  buildServeMetricRows,
  getAttackCourseType,
  getAttackEffectRate,
  getRate,
  getServeEffectRate,
  getTeamPlays,
} from "@/lib/domain/analysis";
import { countEndZones, getCourseLine, type CourseLine, type ZoneCount } from "@/lib/domain/court";
import { normalizeShirtNumber } from "@/lib/domain/my-plays";
import type { MemberPosition } from "@/lib/domain/portal";
import type { ParsedMatch, ParsedPlay, TeamSide } from "@/lib/domain/types";

// ---------- マイプレーの成績(改修計画の段階3、2026-10-24 から) ----------
// 数字は、総合分析と同じ関数(lib/domain/analysis.ts)で出す。チームの数字は、同じ試合の自チーム全員を合わせたもの。
// それぞれの数字に「どのプレーか」(StatFilter)を付けて、押すとそのプレーの映像に絞れるようにする。

export type AttackCourse = "feint" | "straight" | "cross";

/** 数字のもとになったプレー。skill は必ず、effects・course は絞るときだけ。 */
export type StatFilter = {
  skill: string;
  effects?: string[];
  course?: AttackCourse;
};

export type StatItem = {
  label: string;
  value: string;
  // チーム全体の同じ数字(比べる数字がないものは null)。
  team: string | null;
  // 押すと映像を絞る(プレーの数を数えたものだけ)。
  filter: StatFilter | null;
};

export type StatSectionKey = "attack" | "serve" | "reception" | "dig" | "block" | "set";

export type StatSection = {
  key: StatSectionKey;
  title: string;
  attempts: number;
  items: StatItem[];
  courses?: { course: AttackCourse; label: string; attempts: number; kills: number; filter: StatFilter }[];
  // コートの図に描く軌道(アタック・サーブだけ。ゾーンのないプレーは描かない)。
  lines?: CourseLine[];
  // 落ちた場所(相手のコートのゾーン)ごとの本数。ヒートマップに使う(2026-10-26 から)。
  zones?: ZoneCount[];
};

export type StatMatchInput = { match: ParsedMatch; side: TeamSide };

// ポジションごとに、先に見せるもの(けーいちの計画、2026-10-24)。ほかのスキルも、プレーがあればあとに並べる。
const POSITION_ORDER: Record<MemberPosition, StatSectionKey[]> = {
  OH: ["attack", "serve", "reception", "dig", "block", "set"],
  OP: ["attack", "serve", "block", "reception", "dig", "set"],
  MB: ["attack", "block", "serve", "dig", "reception", "set"],
  S: ["set", "serve", "block", "dig", "attack", "reception"],
  Li: ["reception", "dig", "set", "serve", "attack", "block"],
};
const DEFAULT_ORDER: StatSectionKey[] = ["attack", "serve", "reception", "dig", "block", "set"];

const COURSE_LABELS: Record<AttackCourse, string> = { straight: "ストレート", cross: "クロス", feint: "フェイント" };

function percent(value: number | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 10) / 10}%` : "—";
}

/** 「3(8.1%)」:数と、本数に対する割合(チームの割合と比べられるように)。 */
function countWithRate(value: number, attempts: number): string {
  return `${value}(${percent(getRate(value, attempts))})`;
}

/** そのプレーが、数字の条件に入るか(映像を絞るのに使う)。 */
export function matchesStatFilter(play: ParsedPlay, filter: StatFilter): boolean {
  if (play.skill !== filter.skill) {
    return false;
  }
  if (filter.effects && !filter.effects.includes(play.effect ?? "")) {
    return false;
  }
  if (filter.course && getAttackCourseType(play) !== filter.course) {
    return false;
  }
  return true;
}

function count(plays: ParsedPlay[], filter: StatFilter): number {
  return plays.filter((play) => matchesStatFilter(play, filter)).length;
}

/**
 * 自分の成績。matches は1試合(この試合)でも、直近の何試合でもよい。
 * プレーのないスキルは出さない。並びはポジションで変える。
 */
export function buildMyStats(input: {
  matches: StatMatchInput[];
  number: string;
  position: MemberPosition | null;
}): StatSection[] {
  const teamPlays = input.matches.flatMap(({ match, side }) => getTeamPlays(match, side));
  const mine = teamPlays.filter((play) => normalizeShirtNumber(play.player) === input.number);
  const sections: Partial<Record<StatSectionKey, StatSection>> = {};

  // アタック
  const attackRows = buildAttackMetricRows(teamPlays);
  const attack = attackRows.find((row) => row.label === input.number);
  if (attack && attack.attempts > 0) {
    const team = attackRows[0];
    const course = buildAttackCourseRows(mine).find((row) => row.player === input.number);
    sections.attack = {
      key: "attack",
      title: "アタック",
      attempts: attack.attempts,
      items: [
        { label: "打数", value: `${attack.attempts}`, team: null, filter: { skill: "A" } },
        {
          label: "決定率",
          value: percent(getRate(attack.kills, attack.attempts)),
          team: percent(getRate(team.kills, team.attempts)),
          filter: { skill: "A", effects: ["#"] },
        },
        { label: "効果率", value: percent(getAttackEffectRate(attack)), team: percent(getAttackEffectRate(team)), filter: null },
        {
          label: "被ブロック",
          value: countWithRate(attack.blockedErrors, attack.attempts),
          team: percent(getRate(team.blockedErrors, team.attempts)),
          filter: { skill: "A", effects: ["/"] },
        },
        {
          label: "ミス",
          value: countWithRate(attack.attackErrors, attack.attempts),
          team: percent(getRate(team.attackErrors, team.attempts)),
          filter: { skill: "A", effects: ["="] },
        },
      ],
      courses: course
        ? (["straight", "cross", "feint"] as AttackCourse[]).map((key) => ({
            course: key,
            label: COURSE_LABELS[key],
            attempts: course[key].attempts,
            kills: course[key].kills,
            filter: { skill: "A", course: key },
          }))
        : undefined,
    };
  }

  // サーブ(効果率は総合分析と同じ:エース ×100、効果 ×25、ミス ×−25)
  const serveRows = buildServeMetricRows(teamPlays);
  const serve = serveRows.find((row) => row.label === input.number);
  if (serve && serve.attempts > 0) {
    const team = serveRows[0];
    sections.serve = {
      key: "serve",
      title: "サーブ",
      attempts: serve.attempts,
      items: [
        { label: "本数", value: `${serve.attempts}`, team: null, filter: { skill: "S" } },
        { label: "効果率", value: percent(getServeEffectRate(serve)), team: percent(getServeEffectRate(team)), filter: null },
        {
          label: "エース",
          value: countWithRate(serve.noTouchAces + serve.serviceAces, serve.attempts),
          team: percent(getRate(team.noTouchAces + team.serviceAces, team.attempts)),
          filter: { skill: "S", effects: ["#", "+"] },
        },
        {
          label: "効果",
          value: countWithRate(serve.effective, serve.attempts),
          team: percent(getRate(team.effective, team.attempts)),
          filter: { skill: "S", effects: ["!"] },
        },
        {
          label: "ミス",
          value: countWithRate(serve.misses, serve.attempts),
          team: percent(getRate(team.misses, team.attempts)),
          filter: { skill: "S", effects: ["="] },
        },
      ],
    };
  }

  // サーブレシーブ(A・B パス率)
  const receptionRows = buildReceptionMetricRows(teamPlays);
  const reception = receptionRows.find((row) => row.label === input.number);
  if (reception && reception.attempts > 0) {
    const team = receptionRows[0];
    sections.reception = {
      key: "reception",
      title: "サーブレシーブ",
      attempts: reception.attempts,
      items: [
        { label: "本数", value: `${reception.attempts}`, team: null, filter: { skill: "R" } },
        {
          label: "A・Bパス率",
          value: percent(getRate(reception.ab, reception.attempts)),
          team: percent(getRate(team.ab, team.attempts)),
          filter: { skill: "R", effects: ["#", "+"] },
        },
        {
          label: "ミス",
          value: countWithRate(reception.errors, reception.attempts),
          team: percent(getRate(team.errors, team.attempts)),
          filter: { skill: "R", effects: ["="] },
        },
      ],
    };
  }

  // ディグ・ブロック・トスは、総合分析に選手ごとの表がないので、ここで数える(ミス = 「=」)。
  const simple = (key: "dig" | "block" | "set", title: string, skill: string, goodLabel: string, good: string[]) => {
    const total = count(mine, { skill });
    if (total === 0) {
      return;
    }
    const teamTotal = count(teamPlays, { skill });
    const goodCount = count(mine, { skill, effects: good });
    const errors = count(mine, { skill, effects: ["="] });
    sections[key] = {
      key,
      title,
      attempts: total,
      items: [
        { label: "本数", value: `${total}`, team: null, filter: { skill } },
        {
          label: goodLabel,
          value: countWithRate(goodCount, total),
          team: percent(getRate(count(teamPlays, { skill, effects: good }), teamTotal)),
          filter: { skill, effects: good },
        },
        {
          label: "ミス",
          value: countWithRate(errors, total),
          team: percent(getRate(count(teamPlays, { skill, effects: ["="] }), teamTotal)),
          filter: { skill, effects: ["="] },
        },
      ],
    };
  };
  simple("dig", "ディグ", "D", "A・B(上がった)", ["#", "+"]);
  simple("block", "ブロック", "B", "シャット", ["#"]);
  simple("set", "トス", "E", "A・B(よいトス)", ["#", "+"]);

  const linesOf = (skill: string) =>
    mine.filter((play) => play.skill === skill).flatMap((play) => getCourseLine(play) ?? []);
  const zonesOf = (skill: string) => countEndZones(mine.filter((play) => play.skill === skill));
  if (sections.attack) {
    sections.attack.lines = linesOf("A");
    sections.attack.zones = zonesOf("A");
  }
  if (sections.serve) {
    sections.serve.lines = linesOf("S");
    sections.serve.zones = zonesOf("S");
  }

  const order = input.position ? POSITION_ORDER[input.position] : DEFAULT_ORDER;
  return order.flatMap((key) => (sections[key] ? [sections[key]] : []));
}

// ---------- 推移とノート(改修計画の段階4、2026-10-24 から) ----------

// 推移の表に出す、スキルごとのいちばん大事な数字。
const MAIN_ITEM: Record<StatSectionKey, string> = {
  attack: "決定率",
  serve: "効果率",
  reception: "A・Bパス率",
  dig: "A・B(上がった)",
  block: "シャット",
  set: "A・B(よいトス)",
};

/** 「3(8.1%)」なら「8.1%」、「29%」はそのまま。 */
function mainValue(section: StatSection): string {
  const item = section.items.find((entry) => entry.label === MAIN_ITEM[section.key]);
  if (!item) {
    return "—";
  }
  const rate = /\(([^)]+)\)$/.exec(item.value);
  return rate ? rate[1] : item.value;
}

export type MyTrend = {
  columns: { key: StatSectionKey; title: string }[];
  rows: { workspaceId: string; label: string; values: string[] }[];
};

/**
 * 試合ごとの推移(新しい順)。列は、直近の試合を合わせた成績の並び(ポジション順)の先頭3つ。
 */
export function buildMyTrend(input: {
  matches: (StatMatchInput & { workspaceId: string; label: string })[];
  number: string;
  position: MemberPosition | null;
}): MyTrend {
  const overall = buildMyStats({ matches: input.matches, number: input.number, position: input.position });
  const columns = overall.slice(0, 3).map((section) => ({
    key: section.key,
    title: `${section.title} ${MAIN_ITEM[section.key].replace(/\(.*\)/, "")}`,
  }));
  const rows = input.matches.map((entry) => {
    const sections = buildMyStats({ matches: [entry], number: input.number, position: input.position });
    return {
      workspaceId: entry.workspaceId,
      label: entry.label,
      values: columns.map((column) => {
        const section = sections.find((candidate) => candidate.key === column.key);
        return section ? mainValue(section) : "—";
      }),
    };
  });
  return { columns, rows };
}

/** 試合の振り返りのノートの下書き(ノートに何も書いていない日だけ、最初に入れる)。 */
export function buildMatchNoteTemplate(input: { title: string; sections: StatSection[] }): string {
  const lines = input.sections.slice(0, 4).map((section) => {
    const items = section.items
      .filter((item) => item.label !== "本数" && item.label !== "打数")
      .slice(0, 2)
      .map((item) => `${item.label} ${item.value}${item.team ? `(チーム ${item.team})` : ""}`);
    return `・${section.title}(${section.attempts}本):${items.join("、")}`;
  });
  return [`【試合の振り返り】${input.title}`, ...lines, "", "よかったこと:", "", "次に直すこと:", ""].join("\n");
}
