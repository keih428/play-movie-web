import type { ParsedMatch } from "@/lib/domain/types";

const SKILL_LABELS: Record<string, string> = {
  S: "サーブ",
  R: "レセプション",
  A: "アタック",
  B: "ブロック",
  D: "ディグ",
  E: "セット",
};

const EFFECT_GRADES: Record<string, string> = {
  "#": "A",
  "+": "B",
  "!": "C",
  "-": "D",
  "/": "E",
  "=": "F",
};

export function getSkillLabel(skill?: string): string {
  if (!skill) {
    return "-";
  }

  return SKILL_LABELS[skill] ?? skill;
}

export function getEffectGrade(effect?: string): string {
  if (!effect) {
    return "-";
  }

  return EFFECT_GRADES[effect] ?? effect;
}

export function getTeamLabel(teamCode: string | undefined, match?: ParsedMatch): string {
  if (!teamCode) {
    return "-";
  }

  if (teamCode === "*") {
    return match?.teams.home.name ?? "ホーム";
  }

  if (teamCode === "a") {
    return match?.teams.away.name ?? "アウェー";
  }

  return teamCode;
}
