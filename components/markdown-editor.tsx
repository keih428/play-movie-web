"use client";

import { useState } from "react";
import { MarkdownText } from "@/components/markdown-text";
import { PORTAL_TEXT_MAX_LENGTH } from "@/lib/domain/portal";

type MarkdownEditorProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
};

/** Markdown で書く欄。「書く」と「プレビュー」を切り替えられ、書き方の見本を開ける(2026-11-01 から)。 */
export function MarkdownEditor({ id, label, value, onChange, rows = 14 }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);

  return (
    <div className="tp-field">
      <div className="tp-md-editor-head">
        <label htmlFor={id}>{label}</label>
        <span className="tp-seg" role="group" aria-label="表示">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
            書く
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
            プレビュー
          </button>
        </span>
      </div>
      {preview ? (
        <div className="tp-md-preview">
          {value.trim() ? <MarkdownText text={value} /> : <p className="tp-small tp-muted">まだ何も書かれていません。</p>}
        </div>
      ) : (
        <textarea
          id={id}
          rows={rows}
          maxLength={PORTAL_TEXT_MAX_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <details className="tp-md-help">
        <summary>Markdown の書き方</summary>
        <pre>{MARKDOWN_SAMPLE}</pre>
      </details>
    </div>
  );
}

const MARKDOWN_SAMPLE = `## 見出し
### 小見出し
**太字**
- 箇条書き
  - 1段下げる(空白2つ)
1. 番号つき
- [ ] チェックボックス
[リンクの文字](https://example.com)
> 注意書き(引用)

| 項目 | 内容 |
|---|---|
| 表 | このように書く |`;
