import { normalizeVsdb } from "@/lib/domain/normalize";
import type { ParsedCollection } from "@/lib/domain/types";

export function parseVsdbText(text: string, fileName: string): ParsedCollection {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return normalizeVsdb(parsed, fileName);
}
