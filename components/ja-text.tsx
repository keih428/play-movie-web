import { Fragment } from "react";
import { Parser, jaModel, jaWordModel } from "budoux";

// 日本語を文節の切れ目でだけ折り返す(2026-11-03 から)。iPhone の Safari では、狭い所で
// 「重/さの記録」「フィ/ジカル」のように単語の途中で改行されていたため。BudouX(Google)で文節に分け、
// 切れ目に <wbr> を入れて、文節の中では改行しない(.tp-phrase:keep-all。収まらない文節だけは途中で折る)。
const phraseParser = new Parser(jaModel);
// カレンダーのマスのようにとても狭い所は、文節より細かい単語で区切る(「練習試合」→「練習/試合」)。
const wordParser = new Parser(jaWordModel);

type JaTextProps = {
  children: string;
  // 単語で区切る(とても狭い所用)。
  fine?: boolean;
  // 区切りを決め打ちするとき(決まった短い見出しなど)。つなげると children と同じ文になること。
  phrases?: string[];
};

export function JaText({ children, fine = false, phrases }: JaTextProps) {
  const parts =
    phrases && phrases.join("") === children ? phrases : (fine ? wordParser : phraseParser).parse(children);
  return (
    <span className="tp-phrase">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
