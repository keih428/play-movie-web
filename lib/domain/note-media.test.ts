import { describe, expect, it } from "vitest";
import { findYouTubeIds, readPhotoIds } from "@/lib/domain/note-media";

describe("ノートの添付", () => {
  it("本文に貼った YouTube の URL を、貼った順に1つずつ拾う", () => {
    const text =
      "今日のサーブ https://youtu.be/abcDEF12345を見て。https://www.youtube.com/watch?v=xyz_987-654&t=3 と https://youtu.be/abcDEF12345";
    expect(findYouTubeIds(text, "https://youtube.com/shorts/short123456")).toEqual([
      "abcDEF12345",
      "xyz_987-654",
      "short123456",
    ]);
  });

  it("YouTube 以外のリンクは拾わない", () => {
    expect(findYouTubeIds("https://example.com/watch?v=abcDEF12345")).toEqual([]);
  });

  it("写真の ID は形の正しいものだけ、重なりなしで読む", () => {
    const id = "0b5c8f5e-2a51-4c4e-9a0e-5f0f3b1f7a21";
    expect(readPhotoIds([id, id, "../etc", 3])).toEqual([id]);
    expect(readPhotoIds(undefined)).toBeUndefined();
  });
});
