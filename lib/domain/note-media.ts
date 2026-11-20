import { splitLinks } from "@/lib/domain/links";
import { extractYouTubeVideoId } from "@/lib/domain/video";

/**
 * ノート・コメントの添付(2026-11-20 から。けーいちの依頼)。
 * 写真は端末で縮めてから上げ(数に上限なし)、動画は YouTube の限定公開の URL を本文に貼ると、その場で再生できる。
 */

// 端末で縮めるときの長い辺(px)と、上げられる1枚の大きさ(Vercel の関数が受け取れるのは 4.5MB まで)。
export const PHOTO_MAX_EDGE = 2048;
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 本文に貼った YouTube の動画の ID(貼った順、同じ動画は1つ)。 */
export function findYouTubeIds(...texts: string[]): string[] {
  const ids: string[] = [];
  for (const text of texts) {
    for (const segment of splitLinks(text)) {
      const id = segment.href ? extractYouTubeVideoId(segment.href) : undefined;
      if (id && /^[\w-]{6,20}$/.test(id) && !ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/** 送られてきた写真の ID の並び。おかしなものは捨て、同じものは1つにする。 */
export function readPhotoIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id));
  return [...new Set(ids)];
}
