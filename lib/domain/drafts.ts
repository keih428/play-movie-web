// ---------- 端末に残す下書き(2026-11-08 から) ----------
// トレ録とノートの、保存していない入力を端末(localStorage)に残す。再読み込み・アプリが落ちた・保存を押し忘れた
// ときも、次に開けば続きから書ける。1人・1日付に1つ。何か変えた時点で作り、保存できたときか「やめる」で捨てたときに消す。
// 保存に失敗したときは残す。
// 下書きを作ったときのサーバーの記録(base)も一緒に覚え、戻すときに変わっていたら(ほかの端末で保存したなど)知らせる。

export type DraftKind = "training" | "note";

export type StoredDraft<T> = {
  // 最後に書いた時刻(ISO)。「何時までの入力か」を出すのに使う。
  savedAt: string;
  // 下書きを作ったときの、サーバーの記録の写し(draftBase で作る)。
  base: string;
  data: T;
};

/** localStorage のうち、下書きで使う所だけ(テストでは Map で代わりをする)。 */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "tp-draft";

function prefixOf(kind: DraftKind, teamSlug: string, memberId: string): string {
  return `${PREFIX}:${kind}:${teamSlug}:${memberId}:`;
}

export function draftKey(kind: DraftKind, teamSlug: string, memberId: string, date: string): string {
  return `${prefixOf(kind, teamSlug, memberId)}${date}`;
}

/** サーバーの記録の写し(比べるためだけに使う)。記録がなければ空。 */
export function draftBase(record: unknown): string {
  return record === null || record === undefined ? "" : JSON.stringify(record);
}

/** 下書きを読む。壊れている・形が違うものは、ないものとして扱う。 */
export function readDraft<T>(
  storage: DraftStorage,
  key: string,
  isData: (value: unknown) => value is T,
): StoredDraft<T> | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null") as Partial<StoredDraft<unknown>> | null;
    if (
      !parsed ||
      typeof parsed.savedAt !== "string" ||
      typeof parsed.base !== "string" ||
      !isData(parsed.data)
    ) {
      return null;
    }
    return { savedAt: parsed.savedAt, base: parsed.base, data: parsed.data };
  } catch {
    return null;
  }
}

/** 下書きを書く。端末がいっぱい・使えないときは false(画面の入力はそのまま残る)。 */
export function writeDraft<T>(storage: DraftStorage, key: string, draft: StoredDraft<T>): boolean {
  try {
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // 消せなくても、次に開いたときに「捨てる」を押せば消える。
  }
}

/** その人の下書きがある日付。新しく書いたものから順に。 */
export function listDraftDates(
  storage: DraftStorage,
  kind: DraftKind,
  teamSlug: string,
  memberId: string,
): { date: string; savedAt: string }[] {
  const prefix = prefixOf(kind, teamSlug, memberId);
  const found: { date: string; savedAt: string }[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) {
        continue;
      }
      const date = key.slice(prefix.length);
      const draft = readDraft(storage, key, (value): value is unknown => value !== undefined);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && draft) {
        found.push({ date, savedAt: draft.savedAt });
      }
    }
  } catch {
    return [];
  }
  return found.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

/** 端末の localStorage。使えない(プライベートブラウズで止められているなど)ときは null。 */
export function browserDraftStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 「18:42」の形(下書きをいつまで書いたか)。 */
export function formatDraftTime(savedAt: string): string {
  const time = new Date(savedAt);
  if (Number.isNaN(time.getTime())) {
    return "";
  }
  return time.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
