import {
  MEMBER_POSITIONS,
  MEMBER_TIERS,
  TRAINING_GROUPS,
  isMemberPosition,
  toTrainingGroup,
  type Member,
} from "@/lib/domain/portal";
import { applyPersonalLogItems } from "@/lib/domain/personal-items";
import {
  FRESHMAN_GRADE,
  addDays,
  buildLogMenuOptions,
  collectVideoLinks,
  findLogMenuKey,
  type LogMenuOption,
  type MenuSelection,
  type TrainingProgram,
  type TrainingSessionRecord,
} from "@/lib/domain/training";
import { listPersonalItems } from "@/lib/server/portal-personal-items-store";
import { getLatestMeasurements, listMemberSessions, toEstimated1rm } from "@/lib/server/portal-training-store";

// トレーニングのメニューのページと、トレ録を書く画面(2026-11-08 に分けた)で同じものを使う。

// 記録の欄の最初の形を、今日から何日前の分まで作っておくか(それより前の日は、空の欄から始める)。
const DEFAULT_PAST_DAYS = 60;

export type MenuSelectionQuery = { tier?: string; slot?: string; pos?: string };

function pick<T extends string>(choices: readonly T[], ...candidates: (string | null | undefined)[]): T {
  return (candidates.find((value) => choices.includes(value as T)) as T | undefined) ?? choices[0];
}

/** メニューの段階・枠・ポジション。名簿で決まっている項目はそれを使い、まだのものだけ画面(URL)で選んだものを使う。 */
export function resolveMenuSelection(current: Member, query: MenuSelectionQuery): MenuSelection {
  return {
    tier: pick(MEMBER_TIERS, current.tier, query.tier, "T1"),
    // 名簿の枠(A・B・C)から、メニューのまとまり(AB・C)を決める。
    slot: pick(TRAINING_GROUPS, toTrainingGroup(current.slot), query.slot),
    position: isMemberPosition(current.position) ? current.position : pick(MEMBER_POSITIONS, query.pos),
    fresh: current.grade === FRESHMAN_GRADE,
  };
}

/** 名簿で決まっていない項目だけを、URL に付けて引き継ぐ(メニューのページ ⇔ 記録の画面)。 */
export function buildSelectionQuery(current: Member, selection: MenuSelection): string {
  const search = new URLSearchParams();
  if (!current.tier) search.set("tier", selection.tier);
  if (!toTrainingGroup(current.slot)) search.set("slot", selection.slot);
  if (!current.position) search.set("pos", selection.position);
  return search.toString();
}

export type TrainingLogData = {
  sessions: TrainingSessionRecord[];
  menuOptions: LogMenuOption[];
  menuKeyByDate: Record<string, string>;
  videoLinks: [string, string][];
};

/**
 * トレ録を書く画面に要るもの。記録の欄は、選んだメニュー(初めは日付から決まる週・曜日)の全部の種目に、
 * 先週(なければ前回)の重さ・回数を入れたもの。メニューは、ほかの週・曜日(上半身の日・自主)にも切り替えられる。
 * 個人の追加メニュー:トレーニング担当がその人に足した種目も入れる。
 */
export async function loadTrainingLogData(
  teamSlug: string,
  current: Member,
  selection: MenuSelection,
  programs: TrainingProgram[],
  today: string,
): Promise<TrainingLogData> {
  const [latest, sessions, personalItems] = await Promise.all([
    getLatestMeasurements(current.id),
    listMemberSessions(current.id),
    listPersonalItems(teamSlug, current.id),
  ]);
  const menuOptions = buildLogMenuOptions(programs, selection, toEstimated1rm(latest)).map((option) =>
    applyPersonalLogItems(option, personalItems),
  );
  const menuKeyByDate: Record<string, string> = {};
  for (let offset = -DEFAULT_PAST_DAYS; offset <= 1; offset += 1) {
    const date = addDays(today, offset);
    const key = findLogMenuKey(programs, menuOptions, date);
    if (key) {
      menuKeyByDate[date] = key;
    }
  }
  return { sessions, menuOptions, menuKeyByDate, videoLinks: collectVideoLinks(programs) };
}
