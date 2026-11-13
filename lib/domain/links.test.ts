import { describe, expect, it } from "vitest";
import { splitLinks } from "@/lib/domain/links";

describe("splitLinks", () => {
  it("URL のない文はそのまま", () => {
    expect(splitLinks("今日はサーブ練")).toEqual([{ text: "今日はサーブ練" }]);
  });

  it("文の途中の URL を分ける", () => {
    expect(splitLinks("動画 https://youtu.be/abc?t=10 を見た")).toEqual([
      { text: "動画 " },
      { text: "https://youtu.be/abc?t=10", href: "https://youtu.be/abc?t=10" },
      { text: " を見た" },
    ]);
  });

  it("空白なしで日本語が続いても、URL だけをリンクにする", () => {
    expect(splitLinks("https://example.com/a_b-c#x参考にした")).toEqual([
      { text: "https://example.com/a_b-c#x", href: "https://example.com/a_b-c#x" },
      { text: "参考にした" },
    ]);
  });

  it("文の終わりの句読点は URL に含めない", () => {
    expect(splitLinks("見て:http://example.com/page.")).toEqual([
      { text: "見て:" },
      { text: "http://example.com/page", href: "http://example.com/page" },
      { text: "." },
    ]);
  });

  it("URL が2つあっても分ける", () => {
    const segments = splitLinks("https://a.example\nhttps://b.example");
    expect(segments.filter((segment) => segment.href).map((segment) => segment.href)).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("javascript: などはリンクにしない", () => {
    expect(splitLinks("javascript:alert(1)")).toEqual([{ text: "javascript:alert(1)" }]);
  });
});
