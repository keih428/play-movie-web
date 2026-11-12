import { describe, expect, it } from "vitest";
import { formatMatchAddedMessage, formatMatchDay } from "@/lib/domain/match-notice";

describe("formatMatchDay", () => {
  it("日本時間の日付にする(夜の UTC は翌日)", () => {
    expect(formatMatchDay("2026-06-24T13:45:42.694Z")).toBe("6/24(水)");
    expect(formatMatchDay("2026-06-24T16:00:00.000Z")).toBe("6/25(木)");
  });

  it("読めなければ null", () => {
    expect(formatMatchDay(undefined)).toBeNull();
    expect(formatMatchDay("なし")).toBeNull();
  });
});

describe("formatMatchAddedMessage", () => {
  it("試合名・日付・チーム・リンク", () => {
    expect(
      formatMatchAddedMessage({
        name: "春季リーグ 第1戦",
        match: {
          startDate: "2026-06-24T13:45:42.694Z",
          teams: { home: { name: "東京大学" }, away: { name: "東京工業大学" } },
        },
        url: "https://utvb.vercel.app/t/utvb/workspaces/abc",
      }),
    ).toBe(
      [
        "🏐 試合ビューアに試合を追加しました:*春季リーグ 第1戦*",
        "6/24(水) 東京大学 vs 東京工業大学",
        "動画とプレーを見る → https://utvb.vercel.app/t/utvb/workspaces/abc",
      ].join("\n"),
    );
  });

  it("試合のデータがなければ、名前とリンクだけ", () => {
    expect(formatMatchAddedMessage({ name: "練習試合", match: undefined, url: "https://x/y" })).toBe(
      ["🏐 試合ビューアに試合を追加しました:*練習試合*", "動画とプレーを見る → https://x/y"].join("\n"),
    );
  });
});
