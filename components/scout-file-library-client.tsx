"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScoutFileLibrary, ScoutFileNode } from "@/lib/domain/types";

type ScoutFileLibraryClientProps = {
  initialLibrary: ScoutFileLibrary;
};

type EditState = {
  id: string;
  name: string;
  note: string;
  parentId: string;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function addNode(
  nodes: ScoutFileNode[],
  parentId: string | null,
  node: ScoutFileNode,
): ScoutFileNode[] {
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

function removeNode(nodes: ScoutFileNode[], targetId: string): ScoutFileNode[] {
  return nodes
    .filter((entry) => entry.id !== targetId)
    .map((entry) => ({
      ...entry,
      children: entry.children ? removeNode(entry.children, targetId) : undefined,
    }));
}

function findNode(
  nodes: ScoutFileNode[],
  targetId: string,
  parentId = "",
): { node: ScoutFileNode; parentId: string } | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return { node, parentId };
    }

    if (node.children) {
      const nested = findNode(node.children, targetId, node.id);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function updateNode(
  nodes: ScoutFileNode[],
  targetId: string,
  updater: (node: ScoutFileNode) => ScoutFileNode,
): ScoutFileNode[] {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return updater(node);
    }

    if (node.children) {
      return {
        ...node,
        children: updateNode(node.children, targetId, updater),
      };
    }

    return node;
  });
}

function collectFolders(
  nodes: ScoutFileNode[],
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

function moveNode(
  root: ScoutFileNode[],
  targetId: string,
  nextParentId: string,
): ScoutFileNode[] {
  const found = findNode(root, targetId);
  if (!found) {
    return root;
  }

  const nextRoot = removeNode(root, targetId);
  return addNode(nextRoot, nextParentId || null, found.node);
}

function reorderAtLevel(
  nodes: ScoutFileNode[],
  targetId: string,
  direction: "up" | "down",
): ScoutFileNode[] {
  const index = nodes.findIndex((node) => node.id === targetId);
  if (index !== -1) {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= nodes.length) {
      return nodes;
    }

    const copy = [...nodes];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    return copy;
  }

  return nodes.map((node) => ({
    ...node,
    children: node.children
      ? reorderAtLevel(node.children, targetId, direction)
      : undefined,
  }));
}

function TreeNode({
  node,
  onDelete,
  onEdit,
  onMove,
}: {
  node: ScoutFileNode;
  onDelete: (id: string) => void;
  onEdit: (node: ScoutFileNode) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  return (
    <article className="tree-node">
      <div className="tree-node-header">
        <div>
          <strong>{node.name}</strong>
          <div className="tag-row">
            <span className="tag">{node.type === "folder" ? "フォルダ" : "試合データ"}</span>
            {node.extension ? <span className="tag">{node.extension}</span> : null}
          </div>
          {node.note ? <p className="muted">{node.note}</p> : null}
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            type="button"
            onClick={() => onMove(node.id, "up")}
          >
            上へ
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => onMove(node.id, "down")}
          >
            下へ
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => onEdit(node)}
          >
            編集
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => onDelete(node.id)}
          >
            削除
          </button>
        </div>
      </div>
      {node.children?.length ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onDelete={onDelete}
              onEdit={onEdit}
              onMove={onMove}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ScoutFileLibraryClient({
  initialLibrary,
}: ScoutFileLibraryClientProps) {
  const [library, setLibrary] = useState(initialLibrary);
  const [parentId, setParentId] = useState("");
  const [folderName, setFolderName] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [note, setNote] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const folders = useMemo(() => collectFolders(library.root), [library.root]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestLibrary() {
      try {
        const response = await fetch("/api/scout-files", { cache: "no-store" });
        const payload = (await response.json()) as {
          library?: ScoutFileLibrary;
          error?: string;
        };

        if (!response.ok || !payload.library) {
          throw new Error(
            payload.error || "試合データライブラリの取得に失敗しました。",
          );
        }

        if (!cancelled) {
          setLibrary(payload.library);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error
              ? error.message
              : "試合データライブラリの取得に失敗しました。",
          );
        }
      }
    }

    void loadLatestLibrary();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveLibrary(nextRoot: ScoutFileNode[]) {
    setIsSaving(true);
    setStatus(undefined);

    try {
      const response = await fetch("/api/scout-files", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ root: nextRoot }),
      });

      const payload = (await response.json()) as {
        library: ScoutFileLibrary;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "試合データライブラリの保存に失敗しました。",
        );
      }
      setLibrary(payload.library);
      setStatus("試合データライブラリを保存しました。");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "試合データライブラリの保存に失敗しました。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddFolder() {
    if (!folderName.trim()) {
      setStatus("フォルダ名を入力してください。");
      return;
    }

    const nextRoot = addNode(library.root, parentId || null, {
      id: makeId(),
      type: "folder",
      name: folderName.trim(),
      note: note.trim() || undefined,
      children: [],
    });

    await saveLibrary(nextRoot);
    setFolderName("");
    setNote("");
  }

  async function handleUpload() {
    if (!uploadFile) {
      setStatus("アップロードするファイルを選択してください。");
      return;
    }

    setIsSaving(true);
    setStatus(undefined);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("parentId", parentId);
      if (uploadName.trim()) {
        formData.append("displayName", uploadName.trim());
      }
      if (note.trim()) {
        formData.append("note", note.trim());
      }

      const response = await fetch("/api/scout-files", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        library?: ScoutFileLibrary;
        error?: string;
      };

      if (!response.ok || !payload.library) {
        throw new Error(payload.error || "upload failed");
      }

      setLibrary(payload.library);
      setUploadFile(null);
      setUploadName("");
      setNote("");
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      setStatus("試合データを登録しました。");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "試合データの登録に失敗しました。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await saveLibrary(removeNode(library.root, id));
  }

  function handleEdit(node: ScoutFileNode) {
    const found = findNode(library.root, node.id);
    setEditing({
      id: node.id,
      name: node.name,
      note: node.note ?? "",
      parentId: found?.parentId ?? "",
    });
  }

  async function handleApplyEdit() {
    if (!editing || !editing.name.trim()) {
      setStatus("編集内容を確認してください。");
      return;
    }

    const found = findNode(library.root, editing.id);
    if (!found) {
      return;
    }

    let nextRoot = updateNode(library.root, editing.id, (node) => ({
      ...node,
      name: editing.name.trim(),
      note: editing.note.trim() || undefined,
    }));

    if (found.parentId !== editing.parentId) {
      nextRoot = moveNode(nextRoot, editing.id, editing.parentId);
    }

    await saveLibrary(nextRoot);
    setEditing(null);
  }

  async function handleMove(id: string, direction: "up" | "down") {
    await saveLibrary(reorderAtLevel(library.root, id, direction));
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-kicker">スタッフ用 試合データ管理</div>
            <h1>VSM / VSDB ライブラリ</h1>
            <p>
              試合データを動画リンクとは別のフォルダ構造で整理し、設定画面から参照してワークスペースへ反映します。
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
              <h2>試合データを追加</h2>
              <p className="muted">
                フォルダを作成して試合データを整理し、vsm / vsdb ファイルを登録します。
              </p>
            </div>

            <div className="field">
              <label htmlFor="scout-parent-folder">親フォルダ</label>
              <select
                id="scout-parent-folder"
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

            <section className="panel-section soft-panel">
              <div className="section-heading">
                <h3>フォルダ作成</h3>
                <p className="muted">年度、大会、相手校などで整理できます。</p>
              </div>

              <div className="field">
                <label htmlFor="folder-name">フォルダ名</label>
                <input
                  id="folder-name"
                  type="text"
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                />
              </div>

              <div className="button-row">
                <button
                  className="button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    void handleAddFolder();
                  }}
                >
                  {isSaving ? "保存中..." : "フォルダを追加"}
                </button>
              </div>
            </section>

            <section className="panel-section soft-panel">
              <div className="section-heading">
                <h3>試合データ登録</h3>
                <p className="muted">
                  登録時に解析も行うため、設定画面ではすぐに選択して反映できます。
                </p>
              </div>

              <div className="field">
                <label htmlFor="upload-name">表示名</label>
                <input
                  id="upload-name"
                  type="text"
                  value={uploadName}
                  onChange={(event) => setUploadName(event.target.value)}
                  placeholder="未入力ならファイル名を利用"
                />
              </div>

              <div className="field">
                <label htmlFor="upload-file">試合データファイル</label>
                <input
                  id="upload-file"
                  ref={uploadInputRef}
                  type="file"
                  accept=".vsm,.vsdb"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                />
              </div>

              <div className="field">
                <label htmlFor="upload-note">メモ</label>
                <textarea
                  id="upload-note"
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
                    void handleUpload();
                  }}
                >
                  {isSaving ? "登録中..." : "試合データを登録"}
                </button>
              </div>
            </section>

            {editing ? (
              <section className="panel-section soft-panel">
                <div className="section-heading">
                  <h3>項目編集</h3>
                  <p className="muted">名前変更、親フォルダ変更、メモ更新ができます。</p>
                </div>

                <div className="field">
                  <label htmlFor="edit-scout-name">名前</label>
                  <input
                    id="edit-scout-name"
                    type="text"
                    value={editing.name}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label htmlFor="edit-scout-parent">親フォルダ</label>
                  <select
                    id="edit-scout-parent"
                    value={editing.parentId}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, parentId: event.target.value } : current,
                      )
                    }
                  >
                    <option value="">ルート</option>
                    {folders
                      .filter((folder) => folder.id !== editing.id)
                      .map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.label}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="edit-scout-note">メモ</label>
                  <textarea
                    id="edit-scout-note"
                    rows={3}
                    value={editing.note}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, note: event.target.value } : current,
                      )
                    }
                  />
                </div>

                <div className="button-row">
                  <button
                    className="button"
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      void handleApplyEdit();
                    }}
                  >
                    編集を保存
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    キャンセル
                  </button>
                </div>
              </section>
            ) : null}

            {status ? <p className="muted">{status}</p> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-inner stack">
            <div>
              <h2>保存済みツリー</h2>
              <p className="muted">
                登録済みの試合データはこのツリーから設定画面で参照されます。
              </p>
            </div>

            {library.root.length === 0 ? (
              <div className="list-item">
                <strong>試合データはまだありません。</strong>
                <p className="muted">左側からフォルダ作成またはファイル登録を行ってください。</p>
              </div>
            ) : (
              <div className="tree-list">
                {library.root.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onMove={handleMove}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
