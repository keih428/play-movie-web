import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/**
 * マニュアルの文を Markdown として出す(2026-11-01 から)。見出し・箇条書き・番号・表・チェックボックス・リンク・
 * 引用・コードに対応。改行はそのまま改行になる(前の書き方の文もそのまま読める)。HTML は書いても出さない。
 * リンクは新しいタブで開く。
 */
export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="tp-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
