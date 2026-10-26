import type { Member } from "@/lib/domain/portal";

// 名簿の「編集」とまとめて編集で使う、画面の入力欄の値(2026-10-26 に portal-members-client から切り出した)。
// 項目の名前は、名簿の API(PATCH /api/portal/members/[memberId])に送る名前と同じ。

export type MemberDraft = {
  name: string;
  number: string;
  grade: string;
  position: string;
  isLeader: boolean;
  role: string;
  isTrainingLead: boolean;
  isSystemAdmin: boolean;
  isExecutive: boolean;
  title: string;
  tier: string;
  slot: string;
  slackId: string;
  active: boolean;
};

export const EMPTY_DRAFT: MemberDraft = {
  name: "",
  number: "",
  grade: "",
  position: "",
  isLeader: false,
  role: "member",
  isTrainingLead: false,
  isSystemAdmin: false,
  isExecutive: false,
  title: "",
  tier: "",
  slot: "",
  slackId: "",
  active: true,
};

export function toDraft(member: Member): MemberDraft {
  return {
    name: member.name,
    number: member.number ?? "",
    grade: member.grade === null ? "" : String(member.grade),
    position: member.position ?? "",
    isLeader: member.isLeader,
    role: member.role,
    isTrainingLead: member.isTrainingLead,
    isSystemAdmin: member.isSystemAdmin,
    isExecutive: member.isExecutive,
    title: member.title ?? "",
    tier: member.tier ?? "",
    slot: member.slot ?? "",
    slackId: member.slackId ?? "",
    active: member.active,
  };
}


/** 元の値から変わった項目だけ(まとめて編集で、変えた所だけを送る)。変わっていなければ null。 */
export function diffDraft(before: MemberDraft, after: MemberDraft): Partial<MemberDraft> | null {
  const changed: Partial<MemberDraft> = {};
  for (const key of Object.keys(after) as (keyof MemberDraft)[]) {
    const left = before[key];
    const right = after[key];
    const same = typeof left === "string" && typeof right === "string" ? left.trim() === right.trim() : left === right;
    if (!same) {
      (changed as Record<string, unknown>)[key] = right;
    }
  }
  return Object.keys(changed).length > 0 ? changed : null;
}
