import {
  MEMBER_SLOTS,
  MEMBER_TIERS,
  isMemberPosition,
  isMemberRole,
} from "@/lib/domain/portal";
import type { MemberPatch } from "@/lib/server/portal-member-store";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readChoice(value: unknown, choices: readonly string[], label: string) {
  const text = readText(value);
  if (text && !choices.includes(text)) {
    throw new Error(`${label}の値が正しくありません。`);
  }
  return text;
}

/** 画面から来た名簿の値を確かめて、送られてきた項目だけを取り出す。 */
export function parseMemberInput(
  body: Record<string, unknown>,
): { patch: MemberPatch } | { error: string } {
  const patch: MemberPatch = {};

  try {
    if ("name" in body) {
      const name = readText(body.name);
      if (!name) {
        throw new Error("名前を入れてください。");
      }
      patch.name = name;
    }
    if ("grade" in body) {
      const grade = body.grade === null || body.grade === "" ? null : Number(body.grade);
      if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 6)) {
        throw new Error("学年の値が正しくありません。");
      }
      patch.grade = grade;
    }
    if ("position" in body) {
      const position = readText(body.position);
      if (position && !isMemberPosition(position)) {
        throw new Error("ポジションの値が正しくありません。");
      }
      patch.position = isMemberPosition(position) ? position : null;
    }
    if ("role" in body) {
      if (!isMemberRole(body.role)) {
        throw new Error("役割の値が正しくありません。");
      }
      patch.role = body.role;
    }
    if ("isLeader" in body) {
      patch.isLeader = Boolean(body.isLeader);
    }
    if ("active" in body) {
      patch.active = Boolean(body.active);
    }
    if ("title" in body) {
      patch.title = readText(body.title);
    }
    if ("slackId" in body) {
      patch.slackId = readText(body.slackId);
    }
    if ("tier" in body) {
      patch.tier = readChoice(body.tier, MEMBER_TIERS, "段階");
    }
    if ("slot" in body) {
      patch.slot = readChoice(body.slot, MEMBER_SLOTS, "枠");
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "入力が正しくありません。" };
  }

  return { patch };
}
