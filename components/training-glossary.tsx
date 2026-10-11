"use client";

import { MouseEvent } from "react";

/** 単語帳の表示の「必修語」。赤シートをかけているとき、意味をタップすると1つずつ見える。 */
export function TrainingGlossary({ entries }: { entries: Record<string, string>[] }) {
  function peek(event: MouseEvent) {
    const answer = (event.target as HTMLElement).closest(".tp-ans");
    if (answer && document.querySelector(".tp")?.getAttribute("data-sheet") === "on") {
      answer.classList.toggle("tp-peek");
    }
  }

  return (
    <div className="tp-gl" onClick={peek}>
      {entries.map((entry, index) => {
        const [relationLabel, ...relationRest] = (entry["関連"] ?? "").split(" ");
        return (
          <article key={entry["見出し語"]}>
            <div className="tp-eh">
              <span className="tp-no">{String(index + 1).padStart(3, "0")}</span>
              <span className="tp-hw">{entry["見出し語"]}</span>
              <span className="tp-pr">{entry["発音"]}</span>
            </div>
            <div className="tp-em">
              <span className="tp-pos">{entry["品詞"]}</span>
              <span className="tp-ans tp-gl-ans">{entry["意味"]}</span>
            </div>
            <p className="tp-small">{entry["説明"]}</p>
            <p className="tp-sent">{entry["例文"]}</p>
            <p className="tp-tr">{entry["訳"]}</p>
            {relationLabel ? (
              <p className="tp-rel">
                <b>{relationLabel}</b>
                {relationRest.join(" ")}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
