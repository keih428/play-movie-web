import { describe, expect, it } from "vitest";
import {
  draftBase,
  draftKey,
  formatDraftTime,
  listDraftDates,
  readDraft,
  removeDraft,
  writeDraft,
  type DraftStorage,
} from "@/lib/domain/drafts";

function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const isText = (value: unknown): value is { text: string } =>
  typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string";

describe("下書き", () => {
  it("人・日付ごとに書いて読み、消せる", () => {
    const storage = memoryStorage();
    const key = draftKey("training", "utvb", "m1", "2026-11-08");
    expect(writeDraft(storage, key, { savedAt: "2026-11-08T09:42:00.000Z", base: "", data: { text: "a" } })).toBe(true);
    expect(readDraft(storage, key, isText)).toEqual({
      savedAt: "2026-11-08T09:42:00.000Z",
      base: "",
      data: { text: "a" },
    });
    // 別の人・別の日付・ノートとは混ざらない
    expect(readDraft(storage, draftKey("training", "utvb", "m2", "2026-11-08"), isText)).toBeNull();
    expect(readDraft(storage, draftKey("training", "utvb", "m1", "2026-11-07"), isText)).toBeNull();
    expect(readDraft(storage, draftKey("note", "utvb", "m1", "2026-11-08"), isText)).toBeNull();
    removeDraft(storage, key);
    expect(readDraft(storage, key, isText)).toBeNull();
  });

  it("壊れたもの・形の違うものは、ないものとして扱う", () => {
    const storage = memoryStorage();
    const key = draftKey("note", "utvb", "m1", "2026-11-08");
    storage.setItem(key, "{壊れている");
    expect(readDraft(storage, key, isText)).toBeNull();
    storage.setItem(key, JSON.stringify({ savedAt: "x", base: "", data: { text: 1 } }));
    expect(readDraft(storage, key, isText)).toBeNull();
  });

  it("端末に書けないときは false を返す", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(writeDraft(storage, "k", { savedAt: "", base: "", data: { text: "a" } })).toBe(false);
  });

  it("その人の下書きの日付を、新しく書いた順に並べる", () => {
    const storage = memoryStorage();
    const write = (member: string, date: string, savedAt: string) =>
      writeDraft(storage, draftKey("training", "utvb", member, date), { savedAt, base: "", data: { text: "" } });
    write("m1", "2026-11-05", "2026-11-05T10:00:00.000Z");
    write("m1", "2026-11-08", "2026-11-08T10:00:00.000Z");
    write("m2", "2026-11-07", "2026-11-07T10:00:00.000Z");
    writeDraft(storage, draftKey("note", "utvb", "m1", "2026-11-06"), { savedAt: "z", base: "", data: {} });
    expect(listDraftDates(storage, "training", "utvb", "m1")).toEqual([
      { date: "2026-11-08", savedAt: "2026-11-08T10:00:00.000Z" },
      { date: "2026-11-05", savedAt: "2026-11-05T10:00:00.000Z" },
    ]);
  });

  it("サーバーの記録の写しは、記録がなければ空", () => {
    expect(draftBase(null)).toBe("");
    expect(draftBase(undefined)).toBe("");
    expect(draftBase({ memo: "a" })).toBe('{"memo":"a"}');
  });

  it("時刻は日本時間の時:分", () => {
    expect(formatDraftTime("2026-11-08T09:42:00.000Z")).toBe("18:42");
    expect(formatDraftTime("壊れている")).toBe("");
  });
});
