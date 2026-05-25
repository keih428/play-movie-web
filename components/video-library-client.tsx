"use client";

import { useState } from "react";
import type { VideoLibrary, VideoLibraryNode } from "@/lib/domain/types";

type VideoLibraryClientProps = {
  initialLibrary: VideoLibrary;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function addNode(
  nodes: VideoLibraryNode[],
  parentId: string | null,
  node: VideoLibraryNode,
): VideoLibraryNode[] {
  if (!parentId) {
    return [...nodes, node];
  }

  return nodes.map((entry) => {
    if (entry.id === parentId && entry.type === "folder") {
      return {
        ...entry,
        children: [...(entry.children ?? []), node],
      };
    }

    if (entry.children) {
      return {
        ...entry,
        children: addNode(entry.children, parentId, node),
      };
    }

    return entry;
  });
}

function removeNode(nodes: VideoLibraryNode[], targetId: string): VideoLibraryNode[] {
  return nodes
    .filter((entry) => entry.id !== targetId)
    .map((entry) => ({
      ...entry,
      children: entry.children ? removeNode(entry.children, targetId) : undefined,
    }));
}

function collectFolders(
  nodes: VideoLibraryNode[],
  depth = 0,
): Array<{ id: string; label: string }> {
  return nodes.flatMap((entry) => {
    if (entry.type !== "folder") {
      return [];
    }

    return [
      {
        id: entry.id,
        label: `${"  ".repeat(depth)}${entry.name}`,
      },
      ...collectFolders(entry.children ?? [], depth + 1),
    ];
  });
}

function TreeNode({
  node,
  onDelete,
}: {
  node: VideoLibraryNode;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="tree-node">
      <div className="tree-node-header">
        <div>
          <strong>{node.name}</strong>
          <div className="tag-row">
            <span className="tag">{node.type === "folder" ? "フォルダ" : "リンク"}</span>
            {node.url ? (
              <a className="tag tag-link" href={node.url} target="_blank" rel="noreferrer">
                開く
              </a>
            ) : null}
          </div>
          {node.note ? <p className="muted">{node.note}</p> : null}
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => onDelete(node.id)}
        >
          削除
        </button>
      </div>
      {node.children?.length ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} onDelete={onDelete} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function VideoLibraryClient({ initialLibrary }: VideoLibraryClientProps) {
  const [library, setLibrary] = useState(initialLibrary);
  const [parentId, setParentId] = useState<string>("");
  const [mode, setMode] = useState<"folder" | "link">("folder");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  const folders = collectFolders(library.root);

  async function saveLibrary(nextRoot: VideoLibraryNode[]) {
    setIsSaving(true);
    setStatus(undefined);

    try {
      const response = await fetch("/api/video-library", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ root: nextRoot }),
      });

      if (!response.ok) {
        throw new Error("failed to save");
      }

      const payload = (await response.json()) as {
        library: VideoLibrary;
      };

      setLibrary(payload.library);
      setStatus("ライブラリを保存しました。");
    } catch {
      setStatus("ライブラリの保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdd() {
    if (!name.trim()) {
      setStatus("名前を入力してください。");
      return;
    }

    if (mode === "link" && !url.trim()) {
      setStatus("リンクURLを入力してください。");
      return;
    }

    const nextRoot = addNode(library.root, parentId || null, {
      id: makeId(),
      type: mode,
      name: name.trim(),
      url: mode === "link" ? url.trim() : undefined,
      note: note.trim() || undefined,
      children: mode === "folder" ? [] : undefined,
    });

    await saveLibrary(nextRoot);
    setName("");
    setUrl("");
    setNote("");
  }

  async function handleDelete(id: string) {
    await saveLibrary(removeNode(library.root, id));
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-kicker">部内動画ライブラリ</div>
            <h1>YouTubeリンク集</h1>
            <p>
              試合外の参考動画、戦術動画、練習メニューなどをフォルダ構造で蓄積していくためのページです。
            </p>
          </div>
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">直下項目数</span>
              <strong>{library.root.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">更新日時</span>
              <strong>{library.updatedAt.slice(0, 16).replace("T", " ")}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>ライブラリ編集</h2>
              <p className="muted">
                フォルダまたはリンクを作成し、任意の親フォルダの下へ追加します。
              </p>
            </div>

            <div className="field">
              <label htmlFor="node-type">追加種別</label>
              <select
                id="node-type"
                value={mode}
                onChange={(event) => setMode(event.target.value as "folder" | "link")}
              >
                <option value="folder">フォルダ</option>
                <option value="link">リンク</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="parent-folder">親フォルダ</label>
              <select
                id="parent-folder"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">ルート</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="node-name">名前</label>
              <input
                id="node-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            {mode === "link" ? (
              <div className="field">
                <label htmlFor="node-url">YouTube リンク</label>
                <input
                  id="node-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="node-note">メモ</label>
              <textarea
                id="node-note"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={isSaving}
                onClick={() => {
                  void handleAdd();
                }}
              >
                {isSaving ? "保存中..." : "追加して保存"}
              </button>
            </div>

            {status ? <p className="muted">{status}</p> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>ライブラリ構造</h2>
              <p className="muted">現在保存されているフォルダと動画リンクの構造です。</p>
            </div>

            {library.root.length === 0 ? (
              <div className="list-item">
                <strong>ライブラリは空です。</strong>
                <p className="muted">左側から最初のフォルダまたはリンクを追加してください。</p>
              </div>
            ) : (
              <div className="tree-list">
                {library.root.map((node) => (
                  <TreeNode key={node.id} node={node} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
