import type { MatchLineup, TeamSide } from "@/lib/domain/types";

export function getRotationNumber(lineup?: MatchLineup): number | undefined {
  return lineup?.setterAt;
}

export function getRotationLabel(lineup?: MatchLineup): string {
  const value = getRotationNumber(lineup);
  return typeof value === "number" ? `ローテ${value}` : "-";
}

export function getSideLabel(side: TeamSide): string {
  return side === "home" ? "自チーム" : "相手チーム";
}
