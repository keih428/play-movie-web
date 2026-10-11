import { Fragment } from "react";

/** `**太字**` だけを太字にして出す(メニューの文は Markdown から来る)。 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
        index % 2 === 1 ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  );
}
