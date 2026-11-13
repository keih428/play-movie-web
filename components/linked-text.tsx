import { Fragment } from "react";
import { splitLinks } from "@/lib/domain/links";

/** 本文の URL を押せるリンクにして出す。リンクは新しいタブで開く。 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((segment, index) =>
        segment.href ? (
          <a key={index} className="tp-link" href={segment.href} target="_blank" rel="noopener noreferrer">
            {segment.text}
          </a>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
