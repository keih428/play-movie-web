import { describe, expect, it } from "vitest";
import { formatMemberFullName, formatMemberName, parseRosterMarkdown } from "@/lib/domain/portal";

describe("名簿の名前(苗字と下の名前)", () => {
  it("名簿は「苗字 名前」、ほかの画面は背番号+苗字のまま", () => {
    expect(formatMemberFullName({ name: "林", givenName: "慶一郎" })).toBe("林 慶一郎");
    expect(formatMemberFullName({ name: "林", givenName: null })).toBe("林");
    expect(formatMemberName("林", "7")).toBe("7林");
  });

  it("これまでの表(名前 = 苗字)は、下の名前に触らない", () => {
    const [member] = parseRosterMarkdown(["| 背番号 | 名前 | 学年 | ポジション |", "|---|---|---|---|", "| 7 | 林 | 3 | OP |"].join("\n"));
    expect(member.name).toBe("林");
    expect("givenName" in member).toBe(false);
  });

  it("「苗字」と「名前」の2列なら、名前は下の名前", () => {
    const [member] = parseRosterMarkdown(["| 苗字 | 名前 | ポジション |", "|---|---|---|", "| 林 | 慶一郎 | OP |"].join("\n"));
    expect(member.name).toBe("林");
    expect(member.givenName).toBe("慶一郎");
  });

  it("「下の名前」の列でも書ける。空なら消す(null)", () => {
    const members = parseRosterMarkdown(
      ["| 名前 | 下の名前 | ポジション |", "|---|---|---|", "| 佐藤 | 健 | OH |", "| 鈴木 |  | MB |"].join("\n"),
    );
    expect(members[0]).toMatchObject({ name: "佐藤", givenName: "健" });
    expect(members[1]).toMatchObject({ name: "鈴木", givenName: null });
  });
});
