import { Fragment } from "react";
import { Parser, jaModel, jaWordModel } from "budoux";

// 日本語を文節の切れ目でだけ折り返す(2026-11-03 から)。iPhone の Safari では、狭い所で
// 「重/さの記録」「フィ/ジカル」のように単語の途中で改行されていたため。BudouX(Google)で文節に分け、
// 文節を1つずつ小さな箱(.tp-phrase-part、inline-block)に入れて、箱の中では改行しない。収まらない文節だけは箱の中で折る。
// (word-break: keep-all と <wbr> だけでは、Safari が半角の「(」の直後で改行してしまうため、箱にしている)
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

// 開きかっこは、行の終わりに残さず次の文節の頭に付ける(「モビリティ(/股関節」を「モビリティ/(股関節」に)。
const OPENING = /[(（「『【〔[〈《]+$/;

function attachOpeningBrackets(parts: string[]): string[] {
  const result = [...parts];
  for (let index = 0; index < result.length - 1; index += 1) {
    const match = result[index].match(OPENING);
    if (match && match[0].length < result[index].length) {
      result[index] = result[index].slice(0, -match[0].length);
      result[index + 1] = match[0] + result[index + 1];
    }
  }
  return result;
}

export function JaText({ children, fine = false, phrases }: JaTextProps) {
  const parts =
    phrases && phrases.join("") === children
      ? phrases
      : attachOpeningBrackets((fine ? wordParser : phraseParser).parse(children));
  return (
    <span className="tp-phrase">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          <span className="tp-phrase-part">{part}</span>
        </Fragment>
      ))}
    </span>
  );
}
