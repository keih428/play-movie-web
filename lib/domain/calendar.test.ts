import { describe, expect, it } from "vitest";
import { isOffEvent, parseCalendarEvents } from "./calendar";

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
