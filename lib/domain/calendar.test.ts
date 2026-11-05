import { describe, expect, it } from "vitest";
import { getEventKind, isOffEvent, parseCalendarEvents } from "./calendar";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:practice-1",
  "DTSTART;VALUE=DATE:20261103",
  "DTEND;VALUE=DATE:20261104",
  "SUMMARY:通常練習",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:off-1",
  "DTSTART;VALUE=DATE:20261104",
  "DTEND;VALUE=DATE:20261105",
  "SUMMARY:オフ(テスト期間)",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("isOffEvent", () => {
  it("「オフ」で始まる予定をオフとみなす", () => {
    expect(isOffEvent("オフ")).toBe(true);
    expect(isOffEvent(" オフ(テスト期間)")).toBe(true);
    expect(isOffEvent("通常練習")).toBe(false);
  });
});

describe("parseCalendarEvents", () => {
  it("ふだんはオフの予定を含めない(出欠とノート用)", () => {
    const events = parseCalendarEvents(ICS, "2026-11-01", "2026-11-30");
    expect(events.map((event) => event.title)).toEqual(["通常練習"]);
  });

  it("includeOff のときは、オフの予定に off の印を付けて含める(予定表用)", () => {
    const events = parseCalendarEvents(ICS, "2026-11-01", "2026-11-30", { includeOff: true });
    expect(events.map((event) => [event.date, event.title, event.off ?? false])).toEqual([
      ["2026-11-03", "通常練習", false],
      ["2026-11-04", "オフ(テスト期間)", true],
    ]);
  });
});

describe("getEventKind(予定表の色分け)", () => {
  it("名前の最初で、練習試合・試合・オフ・練習を分ける", () => {
    expect(getEventKind({ title: "練習試合 vs ○○大" })).toBe("practice-match");
    expect(getEventKind({ title: "試合(春季リーグ)" })).toBe("match");
    expect(getEventKind({ title: " 試合" })).toBe("match");
    expect(getEventKind({ title: "オフ" })).toBe("off");
    expect(getEventKind({ title: "練習" })).toBe("practice");
    // 名前の途中に「試合」があっても、最初でなければ練習
    expect(getEventKind({ title: "練習(試合形式)" })).toBe("practice");
    expect(getEventKind({ title: "練習", off: true })).toBe("off");
    // 枠の英字が頭に付いていても反応する(半角・全角、空白をはさんでも)
    expect(getEventKind({ title: "AB練習試合" })).toBe("practice-match");
    expect(getEventKind({ title: "C練習試合 vs ○○大" })).toBe("practice-match");
    expect(getEventKind({ title: "BC試合" })).toBe("match");
    expect(getEventKind({ title: "ＡＢ 試合" })).toBe("match");
    expect(getEventKind({ title: "A・練習試合" })).toBe("practice-match");
    // 英字のあとが練習なら練習のまま
    expect(getEventKind({ title: "AB練習" })).toBe("practice");
    expect(getEventKind({ title: "C練習(試合形式)" })).toBe("practice");
  });
});
