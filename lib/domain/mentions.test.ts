import { describe, expect, it } from "vitest";
import {
  filterMentionCandidates,
  findMentionQuery,
  findMentionedIds,
  listThreadParticipantIds,
  splitMentions,
  type MentionMember,
} from "@/lib/domain/mentions";

const members: MentionMember[] = [
  { id: "a", name: "佐藤", displayName: "1佐藤", number: "1", position: "S", grade: 3 },
  { id: "b", name: "鈴木", displayName: "15鈴木", number: "15", position: "OH", grade: 2 },
  { id: "c", name: "田中", displayName: "12田中", number: "12", position: "S", grade: 1 },
  { id: "d", name: "田中", displayName: "20田中", number: "20", position: "MB", grade: 2 },
  { id: "e", name: "高橋", displayName: "T高橋", number: "T", position: null, grade: 2 },
];

describe("splitMentions", () => {
  it("名前のあとに文字が続いても、表示名で分ける", () => {
    expect(splitMentions("@1佐藤さん どう思う?", members)).toEqual([
      { text: "@1佐藤", memberId: "a" },
      { text: "さん どう思う?" },
    ]);
  });

  it("長い表示名を先に当てる(@15鈴木 を @1… と読まない)", () => {
    expect(findMentionedIds("@15鈴木", members)).toEqual(["b"]);
  });

  it("全角の@も受ける", () => {
    expect(findMentionedIds("＠T高橋 お願いします", members)).toEqual(["e"]);
  });

  it("苗字だけは、同じ苗字が1人のときだけ", () => {
    expect(findMentionedIds("@鈴木 @田中", members)).toEqual(["b"]);
  });

  it("名簿にない @ はそのまま", () => {
    expect(splitMentions("@山本 さん", members)).toEqual([{ text: "@山本 さん" }]);
  });

  it("同じ人を何度呼んでも1回", () => {
    expect(findMentionedIds("@1佐藤 と @12田中、@1佐藤", members)).toEqual(["a", "c"]);
  });
});

describe("findMentionQuery", () => {
  it("カーソルの前の @ からを返す", () => {
    expect(findMentionQuery("おすすめは?@S")).toEqual({ start: 6, query: "S" });
    expect(findMentionQuery("@")).toEqual({ start: 0, query: "" });
  });

  it("空白をはさんだら終わり", () => {
    expect(findMentionQuery("@1佐藤 ありがとう")).toBeNull();
  });
});

describe("filterMentionCandidates", () => {
  it("ポジションでまとめて引ける", () => {
    expect(filterMentionCandidates(members, "s").map((member) => member.id)).toEqual(["a", "c"]);
  });

  it("苗字・背番号の頭でも引ける", () => {
    expect(filterMentionCandidates(members, "田中").map((member) => member.id)).toEqual(["c", "d"]);
    expect(filterMentionCandidates(members, "1").map((member) => member.id)).toEqual(["a", "b", "c"]);
  });
});

describe("listThreadParticipantIds", () => {
  it("書いた人と、呼ばれた人", () => {
    expect(
      listThreadParticipantIds(
        [
          { authorId: "b", body: "@1佐藤 さんどうですか" },
          { authorId: "a", body: "@12田中 にも聞いてみて" },
          { authorId: "b", body: "ありがとうございます" },
        ],
        members,
      ),
    ).toEqual(["b", "a", "c"]);
  });
});
