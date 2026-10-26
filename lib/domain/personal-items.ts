import {
  TRAINING_DAYS,
  type LogMenuOption,
  type ResolvedDay,
  type ResolvedItem,
  type TrainingDay,
} from "@/lib/domain/training";

// ---------- 個人の追加メニュー(2026-10-26 から) ----------
// 面談で決めた種目を、トレーニング担当がその人の画面のメニューに足す。メニューの「個人の追加(面談で…)」の行が
// あればそこに入れ替え、なければその日の最後に足す。トレ録の欄にも、同じ種目が最初から入る。

export type PersonalItem = {
  id: string;
  name: string;
  // 回数・セット数(例:「10回 × 3」)。トレ録の欄のセット数もここから読む。
  dose: string;
  tip: string;
  days: TrainingDay[];
  // 重さを記録する種目か(トレ録で重さの欄を出す)。
  weighted: boolean;
};

export const PERSONAL_ITEM_LIMITS = { name: 60, dose: 40, tip: 200, perMember: 20 } as const;

const PLACEHOLDER_PREFIX = "個人の追加";

export function isPersonalPlaceholder(name: string): boolean {
  return name.startsWith(PLACEHOLDER_PREFIX);
}

function toResolved(item: PersonalItem): ResolvedItem {
  return {
    name: item.name,
    dose: item.dose,
    tip: item.tip,
    main: false,
    swapped: false,
    weighted: item.weighted,
    kind: "",
    targetKg: null,
    videoUrl: null,
    english: null,
    personal: true,
  };
}

/** メニューの1日に、その人の種目を入れる。その日の種目がなければ、そのまま返す。 */
export function applyPersonalItems(day: ResolvedDay, items: PersonalItem[]): ResolvedDay {
  const mine = items.filter((item) => item.days.includes(day.day)).map(toResolved);
  if (mine.length === 0 || day.items.length === 0) {
    return day;
  }
  // メニューにもう同じ名前の種目があれば、二重にしない(個人の方を残す)。
  const names = new Set(mine.map((item) => item.name));
  const rest = day.items.filter((item) => !names.has(item.name));
  const slot = rest.findIndex((item) => isPersonalPlaceholder(item.name));
  return {
    ...day,
    items: slot >= 0 ? [...rest.slice(0, slot), ...mine, ...rest.slice(slot + 1)] : [...rest, ...mine],
  };
}

/** トレ録で選べるメニューにも、同じように入れる。 */
export function applyPersonalLogItems(option: LogMenuOption, items: PersonalItem[]): LogMenuOption {
  const day: ResolvedDay = {
    day: option.day,
    title: "",
    time: "",
    date: null,
    items: option.items.map((item) => ({
      ...item,
      tip: "",
      main: false,
      swapped: false,
      videoUrl: null,
      english: null,
    })),
    extras: [],
  };
  const applied = applyPersonalItems(day, items);
  if (applied === day) {
    return option;
  }
  return {
    ...option,
    items: applied.items.map(({ name, dose, kind, weighted, targetKg }) => ({ name, dose, kind, weighted, targetKg })),
  };
}

/** 画面・API から来た曜日の並びを、決まった順に揃える(知らない値は捨てる)。 */
export function normalizePersonalDays(value: unknown): TrainingDay[] {
  const list = Array.isArray(value) ? value : [];
  return TRAINING_DAYS.filter((day) => list.includes(day));
}
