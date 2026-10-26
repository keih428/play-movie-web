import type { MemberPosition, TrainingGroup } from "@/lib/domain/portal";

// メニューのデータ。配布版の Markdown から `build.py --json` で作ったものを、そのままの形で持つ。
export type LiftKind = "sq" | "dl" | "bp";
export type MenuItemKind = LiftKind | "main" | "jump" | "strong" | "pct" | "";

export type MenuItem = {
  n: string;
  d?: string;
  t?: string;
  kind?: MenuItemKind;
  of?: LiftKind;
  pct?: number;
  // B枠:null は「やらない」、[種目名, 回数] は置き換え。
  b?: [string, string] | null;
  t0?: string;
  w?: boolean;
};

export type MenuWeek = {
  k: string;
  s: string;
  e: string;
  name: string;
  mode: "intro1" | "intro2" | "load" | "test";
  deload: boolean;
  reps: number | null;
  sets: number | null;
  pct: number | null;
  rir: string;
  desc: string;
  brun: string;
  satnote: string;
};

export type MenuLoad = { reps: number; sets: number; pct: number; rir: string };

export type MenuTier = {
  name: string;
  target: string;
  goal: string;
  tueName: string;
  thuName: string;
  tue: MenuItem[];
  thu: MenuItem[];
  notes: string[];
};

export type TrainingMenu = {
  s: Record<string, string>;
  weeks: MenuWeek[];
  t3: Record<string, MenuLoad>;
  legs: Record<string, MenuTier>;
  upper: {
    satA: MenuItem[];
    satB: MenuItem[];
    self: MenuItem[];
    name1: string;
    name2: string;
    desc: string;
    // 個人の追加:[目的, 種目の例]
    addons?: [string, string][];
  };
  pos: Record<string, { A: string; B: string }>;
  vid: [string, string, string][];
  // 「ルールと説明」:[見出し, HTML]。読み込むときに、許したタグだけに絞ってある。
  ref?: [string, string][];
  // 単語帳の表示で使う。en:[日本語, 英語, 発音]、gl:必修語(見出し語・発音・品詞・意味・説明・例文・訳・関連)
  en?: [string, string, string][];
  gl?: Record<string, string>[];
};

// メニューは期間ごと(2か月など)に1つ。最初の週の開始日を、その期間の名前(キー)にする。
export type TrainingProgram = {
  key: string;
  menu: TrainingMenu;
};

// 年間の方針。`build.py --json` が年間方針.md から作る plan.json の形。
export type PlanBlock = {
  s: string;
  e: string;
  name: string;
  role: string;
  aim: string;
  what: string;
  events: string;
};

export type TrainingPlan = {
  kind: "plan";
  s: Record<string, string>;
  blocks: PlanBlock[];
  // [見出し, HTML]。読み込むときに、許したタグだけに絞ってある。
  sections: [string, string][];
};

export type PeriodStatus = "past" | "current" | "upcoming";

export const TRAINING_DAYS = ["tue", "thu", "sat", "self"] as const;
export type TrainingDay = (typeof TRAINING_DAYS)[number];

export const TRAINING_DAY_LABELS: Record<TrainingDay, string> = {
  tue: "火",
  thu: "木",
  sat: "土",
  self: "自主",
};

export const LIFT_LABELS: Record<LiftKind, string> = {
  sq: "スクワット",
  dl: "トラップバーDL",
  bp: "ベンチ",
};

export const MEASUREMENT_ITEMS = ["bw", "sq", "dl", "bp"] as const;
export type MeasurementItem = (typeof MEASUREMENT_ITEMS)[number];

export type Measurement = {
  item: MeasurementItem;
  value: number;
  // 何回挙げた重さか(1 か 3)。体重は null。
  rm: number | null;
  measuredOn: string;
};

export type Estimated1rm = Partial<Record<LiftKind, number>>;

// 名簿の学年は新体制の学年なので、「2」がいまの1年生(国公立大会に出る学年)。
export const FRESHMAN_GRADE = 2;

export type MenuSelection = {
  tier: string;
  // トレーニングのまとまり。AB = 練習の前、C = 練習の後。配布版の menu.json では、AB を「A」、C を「B」の名前で持っている。
  slot: TrainingGroup;
  position: MemberPosition;
  fresh: boolean;
};

export type ResolvedItem = {
  name: string;
  dose: string;
  tip: string;
  main: boolean;
  swapped: boolean;
  weighted: boolean;
  kind: MenuItemKind;
  targetKg: number | null;
  videoUrl: string | null;
  // 単語帳の表示の見出し([英語, 発音])。なければ日本語の名前を見出しにする。
  english: [string, string] | null;
  // トレーニング担当がその人だけに足した種目(個人の追加メニュー、2026-10-26 から)。
  personal?: boolean;
};

export type ResolvedDay = {
  day: TrainingDay;
  title: string;
  time: string;
  date: string | null;
  items: ResolvedItem[];
  // 種目の表のあとに出す文(ポジション別の追加、タバタ など)。**太字** を含む。
  extras: string[];
};

export type ResolvedWeek = {
  week: MenuWeek;
  tierName: string;
  notes: string[];
  days: ResolvedDay[];
  tierNotes: string[];
  footer: string;
};

const NO_WEIGHT_PATTERN =
  /ジャンプ|ホップ|バウンド|ポゴ|プランク|ストレッチ|ウォームアップ|幅跳び|着地|メディシンボール|ノルディック|アブローラー|デッドバグ|個人の追加|ヒップリフト|ダッシュ|肩のケア/;

/** 重さの欄を出す種目か。メニューに「重さの記録」の列があれば、それを優先する。 */
export function isWeightedItem(name: string, kind: MenuItemKind, override?: boolean): boolean {
  if (override !== undefined) {
    return override;
  }
  if (kind === "sq" || kind === "dl" || kind === "bp" || kind === "main" || kind === "pct") {
    return true;
  }
  return name.includes("重り付き") || !NO_WEIGHT_PATTERN.test(name);
}

export function roundToPlate(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

/** 測定の記録から推定1RMを出す。3RM は 1.1 倍、1RM はそのまま。 */
export function estimate1rm(measurement: Pick<Measurement, "value" | "rm">): number {
  return measurement.rm === 1 ? measurement.value : measurement.value * 1.1;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatMonthDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}`;
}

export function getProgramRange(menu: TrainingMenu): { start: string; end: string } {
  return { start: menu.weeks[0].s, end: menu.weeks[menu.weeks.length - 1].e };
}

/** 「2026年11〜12月」の形。 */
export function formatPeriod(start: string, end: string): string {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  if (startYear !== endYear) {
    return `${startYear}年${startMonth}月〜${endYear}年${endMonth}月`;
  }
  return startMonth === endMonth
    ? `${startYear}年${startMonth}月`
    : `${startYear}年${startMonth}〜${endMonth}月`;
}

export function getPeriodStatus(start: string, end: string, today: string): PeriodStatus {
  if (today < start) {
    return "upcoming";
  }
  return today > end ? "past" : "current";
}

/**
 * 開くメニューを選ぶ。指定があればそれ、なければ今日が入る期間、
 * それもなければ次に始まる期間、最後はいちばん新しい過去の期間。
 */
export function pickProgram(
  programs: TrainingProgram[],
  today: string,
  requestedKey?: string,
): TrainingProgram | null {
  const sorted = [...programs].sort((left, right) => left.key.localeCompare(right.key));
  const status = (program: TrainingProgram) => {
    const { start, end } = getProgramRange(program.menu);
    return getPeriodStatus(start, end, today);
  };
  return (
    sorted.find((program) => program.key === requestedKey) ??
    sorted.find((program) => status(program) === "current") ??
    sorted.find((program) => status(program) === "upcoming") ??
    sorted[sorted.length - 1] ??
    null
  );
}

/** その週(開始日)が入っているメニュー。 */
export function findProgramForWeek(
  programs: TrainingProgram[],
  weekStart: string,
): TrainingProgram | null {
  return programs.find((program) => program.menu.weeks.some((week) => week.s === weekStart)) ?? null;
}

/** その日が入る、年間の方針の区切り。 */
export function findPlanBlock(plan: TrainingPlan | null, date: string): PlanBlock | null {
  return plan?.blocks.find((block) => date >= block.s && date <= block.e) ?? null;
}

/** 今日が入る週。期間の前なら最初の週、後なら最後の週。 */
export function findWeekIndex(menu: TrainingMenu, today: string): number {
  const index = menu.weeks.findIndex((week) => today >= week.s && today <= week.e);
  if (index >= 0) {
    return index;
  }
  return today < menu.weeks[0].s ? 0 : menu.weeks.length - 1;
}

/** 種目名 → メイン種目の種類。記録を集計するときに使う。 */
export function buildLiftKindMap(menu: TrainingMenu): Map<string, LiftKind> {
  const map = new Map<string, LiftKind>();
  const lists = [
    ...Object.values(menu.legs).flatMap((tier) => [tier.tue, tier.thu]),
    menu.upper.satA,
    menu.upper.satB,
    menu.upper.self,
  ];
  for (const item of lists.flat()) {
    if (item.kind === "sq" || item.kind === "dl" || item.kind === "bp") {
      map.set(item.n, item.kind);
    }
  }
  return map;
}

/** 種目名に合う英語の見出し([英語, 発音])。単語帳の表示で使う。 */
export function findEnglishName(menu: TrainingMenu, name: string): [string, string] | null {
  const entry = (menu.en ?? []).find(([japanese]) => name.includes(japanese));
  return entry ? [entry[1], entry[2]] : null;
}

function findVideoUrl(menu: TrainingMenu, name: string): string | null {
  return menu.vid.find(([keyword]) => name.includes(keyword))?.[1] ?? null;
}

type LiftContext = {
  menu: TrainingMenu;
  week: MenuWeek;
  day: TrainingDay;
  selection: MenuSelection;
  estimated: Estimated1rm;
};

function resolveLift(
  lift: LiftKind,
  { menu, week, day, selection, estimated }: LiftContext,
): { dose: string; tip: string; targetKg: number | null } {
  const lead = menu.s["担当者"] ?? "";

  if (week.mode === "intro1") {
    return {
      dose: "軽い重さ",
      tip: `フォームの確認(${lead}が見る)。合格したら W2 で3RMを測る`,
      targetKg: null,
    };
  }
  if (week.mode === "intro2") {
    const isTestDay =
      (day === "tue" && lift === "sq") ||
      (day === "thu" && lift === "dl") ||
      (day === "sat" && lift === "bp");
    return isTestDay
      ? { dose: "3RMの測定", tip: "フォームが合格した人。「測定」のやり方で", targetKg: null }
      : { dose: "軽い重さ", tip: "フォームの確認と練習", targetKg: null };
  }
  if (week.mode === "test") {
    const advanced = selection.tier === "T2" || selection.tier === "T3";
    return advanced
      ? { dose: "1RMの記録会", tip: `「測定」のやり方で。${lead}が立ち会う`, targetKg: null }
      : {
          dose: "3RMの測定",
          tip: "フォームの合格をもらった T1 は、1RMの記録会にも出られる",
          targetKg: null,
        };
  }

  // 1年生は W6 で量を減らしたので、W7(軽い週)は W6 の表をもう一度。
  const previousWeek = menu.weeks.find((entry) => entry.k === "W6");
  const baseWeek = selection.fresh && week.k === "W7" && previousWeek ? previousWeek : week;
  const t3Load = selection.tier === "T3" && day !== "sat" ? menu.t3[baseWeek.k] : undefined;
  const load: MenuLoad = t3Load ?? {
    reps: baseWeek.reps ?? 0,
    sets: baseWeek.sets ?? 0,
    pct: baseWeek.pct ?? 0,
    rir: baseWeek.rir,
  };

  let sets = load.sets;
  if (!t3Load && (day === "sat" || selection.slot === "AB")) {
    sets = Math.min(3, load.sets);
  }
  if (selection.fresh && week.k === "W6" && day === "tue") {
    sets = 2;
  }

  const base = estimated[lift];
  return {
    dose: `${load.reps}回 × ${sets}`,
    tip: `推定1RMの${load.pct}%、${load.rir}`,
    targetKg: base ? roundToPlate((base * load.pct) / 100) : null,
  };
}

function resolveItems(
  items: MenuItem[],
  context: LiftContext & { lightJumps?: boolean; slot: TrainingGroup },
): ResolvedItem[] {
  const { menu, selection, estimated } = context;
  const resolved: ResolvedItem[] = [];

  for (const item of items) {
    const kind = item.kind ?? "";
    let name = item.n;
    let dose = item.d ?? "";
    let tip = item.t ?? "";
    let main = kind === "main";
    let swapped = false;
    let targetKg: number | null = null;
    let weightOverride = item.w;

    if (kind === "bp" && selection.tier === "T0" && item.t0) {
      name = item.t0;
      dose = "";
      tip = "";
      main = true;
    } else if (kind === "sq" || kind === "dl" || kind === "bp") {
      const lift = resolveLift(kind, context);
      dose = lift.dose;
      tip = tip ? `${tip}。${lift.tip}` : lift.tip;
      targetKg = lift.targetKg;
      main = true;
    }
    if (kind === "pct" && item.of && item.pct) {
      const base = estimated[item.of];
      targetKg = base ? roundToPlate((base * item.pct) / 100) : null;
    }

    if (context.slot === "C" && item.b !== undefined) {
      if (item.b === null) {
        continue;
      }
      [name, dose] = item.b;
      tip = "";
      swapped = true;
      if (kind !== "pct") {
        targetKg = null;
        weightOverride = undefined;
      }
    }

    if (name.includes("メディシンボール") && !tip) {
      tip =
        "コンクリートの広場で投げる。ボールの重さと決まりは「メディシンボールのメニュー」。雨の日は「メディシンボールが投げられないとき」の種目に置き換える";
    }
    if (context.lightJumps && (kind === "jump" || kind === "strong")) {
      if (kind === "strong") {
        continue;
      }
      dose = "3回 × 3";
      tip = "大会の前の週は軽く。キレを保つだけ";
    }

    const effectiveKind: MenuItemKind = swapped && kind !== "pct" ? "" : kind;
    resolved.push({
      name,
      dose,
      tip,
      main,
      swapped,
      weighted: isWeightedItem(name, effectiveKind, weightOverride),
      kind: effectiveKind,
      targetKg,
      videoUrl: findVideoUrl(menu, name),
      english: findEnglishName(menu, name),
    });
  }

  return resolved;
}

function plainItem(name: string, dose: string, tip = ""): ResolvedItem {
  return {
    name,
    dose,
    tip,
    main: false,
    swapped: false,
    weighted: false,
    kind: "",
    targetKg: null,
    videoUrl: null,
    english: null,
  };
}

/** その週に、その人がやることを組み立てる(配布版のサイトと同じ決まり)。 */
export function resolveWeek(
  menu: TrainingMenu,
  weekIndex: number,
  selection: MenuSelection,
  estimated: Estimated1rm,
): ResolvedWeek {
  const week = menu.weeks[weekIndex];
  const tier = menu.legs[selection.tier];
  const settings = menu.s;
  const { slot, fresh } = selection;
  const freshBeforeMeet = fresh && week.k === "W6";
  const freshAfterMeet = fresh && week.k === "W7";
  const base = { menu, week, selection, estimated };

  const notes: string[] = [];
  if (freshBeforeMeet) notes.push(settings["1年生の大会前の週"]);
  if (freshAfterMeet) notes.push(settings["1年生の大会後の週"]);
  if (selection.tier === "T3" && week.mode === "load") notes.push(settings["T3の注意"]);
  if (selection.tier === "T2" && week.mode === "load") notes.push(settings["T2の導入"]);
  if (week.mode === "test") notes.push(settings["測定週の注意"]);

  const weekdayTime = slot === "AB" ? settings["火の枠A"] : settings["火の枠B"];
  const positionLine = `**ポジション別の追加(10〜15分)** ${menu.pos[selection.position]?.[slot === "AB" ? "A" : "B"] ?? ""}`;
  const hasTabata =
    slot === "AB" &&
    ((week.mode !== "test" && !week.deload && !freshBeforeMeet) || freshAfterMeet);
  const weekdayExtras = [positionLine, ...(hasTabata ? [settings["タバタ"]] : [])];

  const days: ResolvedDay[] = [
    {
      day: "tue",
      title: tier.tueName,
      time: weekdayTime,
      date: addDays(week.s, 1),
      items: resolveItems(tier.tue, { ...base, day: "tue", slot, lightJumps: freshBeforeMeet }),
      extras: weekdayExtras,
    },
  ];

  if (freshBeforeMeet) {
    days.push({
      day: "thu",
      title: "大会の2日前",
      time: "30分ほど",
      date: addDays(week.s, 3),
      items: [
        plainItem("動的ストレッチ", "10分"),
        plainItem("軽いジャンプ・ダッシュ", "数本", "体を起こすだけ。疲れを残さない"),
        plainItem("肩のケア(フェイスプル、チューブで外旋)", "各15回 × 2"),
      ],
      extras: [],
    });
  } else {
    days.push({
      day: "thu",
      title: tier.thuName,
      time: weekdayTime,
      date: addDays(week.s, 3),
      items: resolveItems(tier.thu, { ...base, day: "thu", slot }),
      extras: [...weekdayExtras, ...(week.mode === "test" ? [settings["測定週のベンチ"]] : [])],
    });
  }

  if (week.mode !== "test") {
    if (freshBeforeMeet) {
      days.push({
        day: "sat",
        title: "国公立大会",
        time: "",
        date: addDays(week.s, 5),
        items: [],
        extras: [settings["大会の土曜"]],
      });
    } else {
      const extras: string[] = [];
      if (slot === "C" && week.brun) {
        extras.push(
          `**10:30〜12:00 外で体力づくり:**${week.brun}。${settings["B枠の体力づくりの注意"]}`,
        );
      }
      if (week.satnote) extras.push(week.satnote);
      days.push({
        day: "sat",
        title: menu.upper.name1,
        time: slot === "AB" ? settings["土の枠A"] : settings["土の枠B"],
        date: addDays(week.s, 5),
        items: resolveItems(slot === "AB" ? menu.upper.satA : menu.upper.satB, {
          ...base,
          day: "sat",
          slot: "AB",
        }),
        extras,
      });
    }

    days.push({
      day: "self",
      title: menu.upper.name2,
      time: settings["自主の時間"],
      date: null,
      items: resolveItems(menu.upper.self, { ...base, day: "self", slot: "AB" }),
      extras: [],
    });
  }

  return {
    week,
    tierName: tier.name,
    notes: notes.filter(Boolean),
    days,
    tierNotes: tier.notes,
    footer: settings["日曜"] ?? "",
  };
}

const REF_TAGS = new Set([
  "p", "ul", "ol", "li", "strong", "b", "em", "br", "h3", "h4",
  "table", "thead", "tbody", "tr", "th", "td", "a",
]);

/**
 * 「ルールと説明」の HTML を、文章と表のタグだけに絞る。属性はすべて落とし、
 * リンクは http(s) の行き先だけ残す。それ以外のタグは文字として出す。
 */
export function sanitizeRefHtml(html: string): string {
  const escapeText = (text: string) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let output = "";
  let lastIndex = 0;

  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g)) {
    output += escapeText(html.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;

    const [whole, closing, rawName, attributes] = match;
    const name = rawName.toLowerCase();
    if (!REF_TAGS.has(name)) {
      output += escapeText(whole);
    } else if (closing) {
      output += `</${name}>`;
    } else if (name === "a") {
      const href = /href="(https?:\/\/[^"\s]+)"/.exec(attributes)?.[1];
      output += href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>";
    } else {
      output += `<${name}>`;
    }
  }

  return output + escapeText(html.slice(lastIndex));
}

/** 読み込ませるデータが、メニューの形をしているかを確かめる。 */
export function validateMenu(value: unknown): TrainingMenu | null {
  const menu = value as Partial<TrainingMenu> | null;
  if (
    !menu ||
    typeof menu !== "object" ||
    !Array.isArray(menu.weeks) ||
    menu.weeks.length === 0 ||
    !menu.s ||
    !menu.pos ||
    !menu.upper ||
    !Array.isArray(menu.upper.satA) ||
    !menu.legs ||
    !["T0", "T1", "T2", "T3"].every((tier) => Array.isArray(menu.legs?.[tier]?.tue))
  ) {
    return null;
  }
  if (!menu.weeks.every((week) => /^\d{4}-\d{2}-\d{2}$/.test(week.s) && typeof week.k === "string")) {
    return null;
  }
  const ref = Array.isArray(menu.ref)
    ? menu.ref
        .filter((entry) => Array.isArray(entry) && entry.every((part) => typeof part === "string"))
        .map(([title, html]): [string, string] => [title, sanitizeRefHtml(html)])
    : [];
  const isTextRow = (row: unknown) => Array.isArray(row) && row.every((cell) => typeof cell === "string");
  const en = Array.isArray(menu.en) ? menu.en.filter(isTextRow) : [];
  const gl = Array.isArray(menu.gl)
    ? menu.gl.filter(
        (row) => row && typeof row === "object" && Object.values(row).every((cell) => typeof cell === "string"),
      )
    : [];
  return { ...menu, t3: menu.t3 ?? {}, vid: menu.vid ?? [], ref, en, gl } as TrainingMenu;
}

/** 読み込ませるデータが、年間の方針の形をしているかを確かめる。 */
export function validatePlan(value: unknown): TrainingPlan | null {
  const plan = value as Partial<TrainingPlan> | null;
  const isDate = (text: unknown) => typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text);
  if (
    !plan ||
    typeof plan !== "object" ||
    plan.kind !== "plan" ||
    !plan.s ||
    !Array.isArray(plan.blocks) ||
    plan.blocks.length === 0 ||
    !plan.blocks.every(
      (block) =>
        block &&
        isDate(block.s) &&
        isDate(block.e) &&
        Object.values(block).every((cell) => typeof cell === "string"),
    )
  ) {
    return null;
  }

  const sections = Array.isArray(plan.sections)
    ? plan.sections
        .filter((entry) => Array.isArray(entry) && entry.every((part) => typeof part === "string"))
        .map(([title, html]): [string, string] => [title, sanitizeRefHtml(html)])
    : [];
  return {
    kind: "plan",
    s: plan.s,
    blocks: [...plan.blocks].sort((left, right) => left.s.localeCompare(right.s)),
    sections,
  };
}

// トレーニング録で、トレーニング担当に向けて書く欄の名前(2026-10-16 までは「リーダー・トレーニング担当へ」)。
export const TRAINING_REQUEST_LABEL = "トレーニング担当へ";
export const TRAINING_REPLY_MAX = 1000;

/** 「トレーニング担当へ」に付いた返信。memberId は書いた部員、authorId は返信した人。 */
export type TrainingRequestReply = {
  id: string;
  memberId: string;
  // 返信が付いている記録の日付(2026-10-20 から。それまでの返信も日付に直してある)。
  sessionDate: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

// ---------- 日付ごとのトレーニング録(2026-10-20 から) ----------
// 部員の声:「筋トレした日に、その日の記録を追加する」「セットごとに重量・回数を変えられる」。1人・1日に記録は1つ。

export type SessionSet = {
  kg: number | null;
  reps: number | null;
};

export type SessionExercise = {
  name: string;
  // スクワット・トラップバーDL・ベンチなら、その印(みんなの記録の集計に使う)。ほかは null。
  lift: LiftKind | null;
  sets: SessionSet[];
};

export type TrainingSessionRecord = {
  date: string;
  exercises: SessionExercise[];
  bodyWeightKg: number | null;
  memo: string;
  request: string;
  updatedAt: string;
};

// みんなの記録で集計する3種目の名前。メニューから入った種目には印(lift)が付いているが、
// 自分で足した種目は名前で見分ける(固定の3種目の欄は 2026-10-23 にやめた。けーいちの決定)。
const LIFT_NAMES: Record<string, LiftKind> = {
  スクワット: "sq",
  バックスクワット: "sq",
  ベンチプレス: "bp",
  トラップバーDL: "dl",
  トラップバーデッドリフト: "dl",
  デッドリフト: "dl",
};

/** 種目名から、集計の印を決める(名前がちょうど同じときだけ。ブルガリアンスクワットなどは付けない)。 */
export function inferLift(name: string): LiftKind | null {
  return LIFT_NAMES[name.replace(/\s+/g, "")] ?? null;
}

export const SESSION_LIMITS = {
  exercises: 40,
  setsPerExercise: 20,
  maxKg: 500,
  maxReps: 200,
  nameLength: 60,
};

/** 「5回 × 3」「3〜5回 × 3」から、回数とセット数を読む。読めなければ null。 */
export function parseDose(dose: string): { reps: number | null; sets: number | null } {
  const text = dose.replace(/\*\*/g, "");
  const full = text.match(/(\d+)(?:\s*[〜~-]\s*\d+)?\s*回\s*[×xX]\s*(\d+)/);
  if (full) {
    return { reps: Number(full[1]), sets: Number(full[2]) };
  }
  const setsOnly = text.match(/[×xX]\s*(\d+)/);
  return { reps: null, sets: setsOnly ? Number(setsOnly[1]) : null };
}

/**
 * 種目ごとの「前の記録」のセット(重さ・回数)。date より前で、先週の同じ曜日(7日前)の記録を優先し、
 * そこになければ、その種目のいちばん新しい記録(けーいちの決定、2026-10-23:先週の分を入れておく)。
 * sessions は新しい順。
 */
export function getPreviousSetsByExercise(
  sessions: TrainingSessionRecord[],
  date: string,
): Record<string, SessionSet[]> {
  const previous: Record<string, SessionSet[]> = {};
  const weekAgo = addDays(date, -7);
  const ordered = [
    ...sessions.filter((session) => session.date === weekAgo),
    ...sessions.filter((session) => session.date < date && session.date !== weekAgo),
  ];
  for (const session of ordered) {
    for (const exercise of session.exercises) {
      if (previous[exercise.name] === undefined && exercise.sets.length > 0) {
        previous[exercise.name] = exercise.sets.map((set) => ({ ...set }));
      }
    }
  }
  return previous;
}

/**
 * 記録の欄の最初の形。その日のメニューの全部の種目(固定の種目は置かない)。
 * 重さと回数は、前の記録(getPreviousSetsByExercise)があればセットごとにそのまま入れ、
 * なければメニューの回数・セット数と、重さの目安で入れる。やらなかった種目は、空のままか消して保存すれば残らない。
 * メニューのない日は、先週の同じ曜日の記録をそのまま入れる。
 */
export function buildDefaultExercises(
  day: { items: LogMenuItem[] } | null,
  previous: Record<string, SessionSet[]>,
  weekAgo?: TrainingSessionRecord,
): SessionExercise[] {
  const copy = (sets: SessionSet[]) => sets.slice(0, SESSION_LIMITS.setsPerExercise).map((set) => ({ ...set }));

  const toSets = (name: string, item: LogMenuItem | undefined): SessionSet[] => {
    if (previous[name]) {
      return copy(previous[name]);
    }
    if (!item) {
      return [{ kg: null, reps: null }];
    }
    const { reps, sets } = parseDose(item.dose);
    const kg = item.weighted ? item.targetKg : null;
    return Array.from({ length: Math.min(sets ?? 1, SESSION_LIMITS.setsPerExercise) }, () => ({ kg, reps }));
  };

  if (!day) {
    return (weekAgo?.exercises ?? []).map((exercise) => ({ ...exercise, sets: copy(exercise.sets) }));
  }

  // 「個人の追加」は種目ではなく、面談で決めた種目を足す場所なので、欄には出さない(自分で「+ 種目を足す」から足す)。
  return day.items.filter((item) => !item.name.startsWith("個人の追加")).map((item) => ({
    name: item.name,
    lift: item.kind === "sq" || item.kind === "dl" || item.kind === "bp" ? item.kind : inferLift(item.name),
    sets: toSets(item.name, item),
  }));
}

// ---------- 記録するときのメニューの選び方(2026-10-24 から) ----------
// 部員の声(けーいち):「何週目の何曜(上半身の日・自主トレ)かを選べると、打ち込みが楽」。
// 日付から決めたメニューを初めに選んでおき、ほかの週・曜日にも切り替えられる。

/** 記録の欄を作るのに要る、メニューの種目の中身。 */
export type LogMenuItem = Pick<ResolvedItem, "name" | "dose" | "kind" | "weighted" | "targetKg">;

export type LogMenuOption = {
  // "期間のキー/週のキー/曜日"(例:"2026-11-02/W1/tue")
  key: string;
  weekKey: string;
  weekLabel: string;
  day: TrainingDay;
  dayLabel: string;
  items: LogMenuItem[];
};

const LOG_DAY_LABELS: Record<TrainingDay, string> = { tue: "火", thu: "木", sat: "土", self: "自主" };

/** 記録で選べるメニュー(全部の期間・週・曜日。種目のない日は除く)。 */
export function buildLogMenuOptions(
  programs: TrainingProgram[],
  selection: MenuSelection,
  estimated: Estimated1rm,
): LogMenuOption[] {
  return programs.flatMap((program) =>
    program.menu.weeks.flatMap((week, weekIndex) =>
      resolveWeek(program.menu, weekIndex, selection, estimated)
        .days.filter((day) => day.items.length > 0)
        .map((day) => ({
          key: `${program.key}/${week.k}/${day.day}`,
          weekKey: `${program.key}/${week.k}`,
          weekLabel: `${formatMonthDay(week.s)}〜 ${week.k} ${week.name}`,
          day: day.day,
          dayLabel: `${LOG_DAY_LABELS[day.day]}・${day.title}`,
          items: day.items.map(({ name, dose, kind, weighted, targetKg }) => ({ name, dose, kind, weighted, targetKg })),
        })),
    ),
  );
}

/** その日付で初めに選ぶメニュー(火・木・土はその曜日、ほかの日は自主)。期間の外なら null。 */
export function findLogMenuKey(programs: TrainingProgram[], options: LogMenuOption[], date: string): string | null {
  for (const program of programs) {
    const week = program.menu.weeks.find((entry) => date >= entry.s && date <= entry.e);
    if (!week) {
      continue;
    }
    const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${week.s}T00:00:00Z`)) / 86400000);
    const day: TrainingDay = offset === 1 ? "tue" : offset === 3 ? "thu" : offset === 5 ? "sat" : "self";
    const weekKey = `${program.key}/${week.k}`;
    const exact = options.find((option) => option.key === `${weekKey}/${day}`);
    return (exact ?? options.find((option) => option.weekKey === weekKey && option.day === "self") ?? options.find((option) => option.weekKey === weekKey))?.key ?? null;
  }
  return null;
}

/** その日のメニュー(火・木・土はその曜日、ほかの日は自主の分)。メニューの期間の外なら null。 */
export function findDayForDate(
  programs: TrainingProgram[],
  date: string,
  selection: MenuSelection,
  estimated: Estimated1rm,
): ResolvedDay | null {
  for (const program of programs) {
    const weekIndex = program.menu.weeks.findIndex((week) => date >= week.s && date <= week.e);
    if (weekIndex < 0) {
      continue;
    }
    const { days } = resolveWeek(program.menu, weekIndex, selection, estimated);
    return days.find((day) => day.date === date) ?? days.find((day) => day.day === "self") ?? null;
  }
  return null;
}

/** 保存する前に、空のセット・空の種目を除く。 */
export function compactExercises(exercises: SessionExercise[]): SessionExercise[] {
  return exercises
    .map((exercise) => ({
      ...exercise,
      name: exercise.name.trim(),
      sets: exercise.sets.filter((set) => set.kg !== null || set.reps !== null),
    }))
    .filter((exercise) => exercise.name && exercise.sets.length > 0);
}

function formatKg(kg: number): string {
  return `${Math.round(kg * 100) / 100}kg`;
}

/** 「100kg × 5回 × 3set」。セットごとに違えば「100kg × 5回、90kg × 8回」。 */
export function summarizeSets(sets: SessionSet[]): string {
  const describe = (set: SessionSet) =>
    [set.kg !== null ? formatKg(set.kg) : "", set.reps !== null ? `${set.reps}回` : ""].filter(Boolean).join(" × ") ||
    "—";
  const groups: { text: string; count: number }[] = [];
  for (const set of sets) {
    const text = describe(set);
    const last = groups[groups.length - 1];
    if (last && last.text === text) {
      last.count += 1;
    } else {
      groups.push({ text, count: 1 });
    }
  }
  return groups.map((group) => (group.count > 1 ? `${group.text} × ${group.count}set` : group.text)).join("、");
}

/** その種目で一番重いセットの重さ(みんなの記録の集計に使う)。 */
export function topSetKg(exercise: SessionExercise): number | null {
  const weights = exercise.sets.map((set) => set.kg).filter((kg): kg is number => kg !== null);
  return weights.length ? Math.max(...weights) : null;
}
