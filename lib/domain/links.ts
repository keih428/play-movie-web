/**
 * ノート・トレ録・コメントの本文に書いた URL を、押せるリンクにする(2026-11-13 から。けーいちの依頼)。
 * 日本語の文は URL のすぐあとに文字が続く(「https://youtu.be/xxx を見て」の空白がない形)ので、
 * URL に使える半角の文字だけを URL とみなす。文の終わりの「.」「,」などは URL に含めない。
 */
export type LinkSegment = { text: string; href?: string };

const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/g;
const TRAILING = /[.,:;!?]+$/;

/** 本文を、ふつうの文字と URL に分ける。 */
export function splitLinks(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING, "");
    // 「http://」だけのものはリンクにしない。
    if (url.length <= "https://".length) {
      continue;
    }
    const start = match.index;
    if (start > last) {
      segments.push({ text: text.slice(last, start) });
    }
    segments.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last) });
  }
  return segments;
}
