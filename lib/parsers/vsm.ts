import { normalizeVsm } from "@/lib/domain/normalize";
import type { ParsedCollection } from "@/lib/domain/types";

export function parseVsmText(text: string, fileName: string): ParsedCollection {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return normalizeVsm(parsed, fileName);
}
