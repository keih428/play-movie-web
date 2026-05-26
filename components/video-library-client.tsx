"use client";

import { useEffect, useMemo, useState } from "react";
import { formatJstDateTime } from "@/lib/domain/datetime";
import { buildTeamApiPath } from "@/lib/domain/team";
import type { VideoLibrary, VideoLibraryNode } from "@/lib/domain/types";

type VideoLibraryClientProps = {
  initialLibrary: VideoLibrary;
  teamName?: string;
  teamSlug?: string;
};

type EditState = {
  id: string;
  name: string;
  url: string;
  note: string;
  parentId: string;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase();
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

function findNode(
  nodes: VideoLibraryNode[],
  targetId: string,
  parentId = "",
): { node: VideoLibraryNode; parentId: string } | null {
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
  nodes: VideoLibraryNode[],
  targetId: string,
  updater: (node: VideoLibraryNode) => VideoLibraryNode,
): VideoLibraryNode[] {
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
  nodes: VideoLibraryNode[],
  path = "",
): Array<{ id: string; label: string }> {
  return nodes.flatMap((entry) => {
    if (entry.type !== "folder") {
      return [];
    }

    const nextPath = path ? `${path}/${entry.name}` : entry.name;

    return [
      {
        id: entry.id,
        label: nextPath,
      },
      ...collectFolders(entry.children ?? [], nextPath),
    ];
  });
}

function getSiblingNodes(
  nodes: VideoLibraryNode[],
  parentId: string | null,
): VideoLibraryNode[] {
  if (!parentId) {
    return nodes;
  }

  const found = findNode(nodes, parentId);
  if (!found || found.node.type !== "folder") {
    return [];
  }

  return found.node.children ?? [];
}

function hasNameConflict(
  nodes: VideoLibraryNode[],
  parentId: string | null,
  name: string,
  excludeId?: string,
): boolean {
  const normalizedName = normalizeName(name);
  return getSiblingNodes(nodes, parentId).some(
    (node) =>
      node.id !== excludeId && normalizeName(node.name) === normalizedName,
  );
}

function collectDescendantFolderIds(
  nodes: VideoLibraryNode[],
  targetId: string,
): string[] {
  const found = findNode(nodes, targetId);
  if (!found || found.node.type !== "folder") {
    return [];
  }

  const ids: string[] = [];
  const walk = (entries: VideoLibraryNode[]) => {
    entries.forEach((entry) => {
      if (entry.type !== "folder") {
        return;
      }

      ids.push(entry.id);
      walk(entry.children ?? []);
    });
  };

  walk(found.node.children ?? []);
  return ids;
}

function moveNode(
  root: VideoLibraryNode[],
  targetId: string,
  nextParentId: string,
): VideoLibraryNode[] {
  const found = findNode(root, targetId);
  if (!found) {
    return root;
  }

  const nextRoot = removeNode(root, targetId);
  return addNode(nextRoot, nextParentId || null, found.node);
}

function reorderAtLevel(
  nodes: VideoLibraryNode[],
  targetId: string,
  direction: "up" | "down",
): VideoLibraryNode[] {
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
  node: VideoLibraryNode;
  onDelete: (id: string) => void;
  onEdit: (node: VideoLibraryNode) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const isFixed = node.systemKey === "match-videos";
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hasChildren = Boolean(node.children?.length);

  return (
    <article className="tree-node">
      <div className="tree-node-header">
        <div className="tree-node-main">
          <div className="tree-node-title-row">
            {node.type === "folder" ? (
              <button
                className="tree-toggle"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((current) => !current)}
              >
                {isExpanded ? "▾" : "▸"}
              </button>
            ) : (
              <span className="tree-toggle tree-toggle-placeholder" aria-hidden="true">
                •
              </span>
            )}
            <strong>{node.name}</strong>
          </div>
          <div className="tag-row">
            <span className="tag">{node.type === "folder" ? "フォルダ" : "リンク"}</span>
            {isFixed ? <span className="tag">固定</span> : null}
            {node.url ? (
              <a className="tag tag-link" href={node.url} target="_blank" rel="noreferrer">
                開く
              </a>
            ) : null}
          </div>
          {node.note ? <p className="muted">{node.note}</p> : null}
        </div>
        <div className="tree-menu">
          <button
            className="tree-menu-trigger"
            type="button"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            ⋯
          </button>
          {isMenuOpen ? (
            <div className="tree-menu-popover">
              <button
                className="tree-menu-item"
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onMove(node.id, "up");
                }}
              >
                上へ
              </button>
              <button
                className="tree-menu-item"
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onMove(node.id, "down");
                }}
              >
                下へ
              </button>
              {!isFixed ? (
                <button
                  className="tree-menu-item"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onEdit(node);
                  }}
                >
                  編集
                </button>
              ) : null}
              {!isFixed ? (
                <button
                  className="tree-menu-item tree-menu-item-danger"
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onDelete(node.id);
                  }}
                >
                  削除
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {hasChildren && isExpanded ? (
        <div className="tree-children">
          {node.children?.map((child) => (
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

export function VideoLibraryClient({
  initialLibrary,
  teamName,
  teamSlug,
}: VideoLibraryClientProps) {
  const [library, setLibrary] = useState(initialLibrary);
  const [parentId, setParentId] = useState<string>("");
  const [mode, setMode] = useState<"folder" | "link">("folder");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);

  const folders = useMemo(() => collectFolders(library.root), [library.root]);
  const editingBlockedFolderIds = useMemo(
    () => (editing ? [editing.id, ...collectDescendantFolderIds(library.root, editing.id)] : []),
    [editing, library.root],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLatestLibrary() {
      try {
        console.log("[video-library-client] load latest start");
        const response = await fetch(buildTeamApiPath("/api/video-library", teamSlug), {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          library?: VideoLibrary;
          error?: string;
        };
        console.log("[video-library-client] load latest response", {
          status: response.status,
          ok: response.ok,
          rootCount: payload.library?.root.length ?? null,
          error: payload.error ?? null,
        });

        if (!response.ok || !payload.library) {
          throw new Error(payload.error || "ライブラリの取得に失敗しました。");
        }

        if (!cancelled) {
          setLibrary(payload.library);
        }
      } catch (error) {
        console.error("[video-library-client] load latest failed", error);
        if (!cancelled) {
          setStatus(
            error instanceof Error
              ? error.message
              : "ライブラリの取得に失敗しました。",
          );
        }
      }
    }

    void loadLatestLibrary();
    return () => {
      cancelled = true;
    };
  }, [teamSlug]);

  async function saveLibrary(nextRoot: VideoLibraryNode[]) {
    setIsSaving(true);
    setStatus(undefined);
    console.log("[video-library-client] save start", {
      rootCount: nextRoot.length,
    });

    try {
      const response = await fetch(buildTeamApiPath("/api/video-library", teamSlug), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ root: nextRoot }),
      });

      const payload = (await response.json()) as {
        library: VideoLibrary;
        error?: string;
      };
      console.log("[video-library-client] save response", {
        status: response.status,
        ok: response.ok,
        rootCount: payload.library?.root.length ?? null,
        error: payload.error ?? null,
      });

      if (!response.ok) {
        throw new Error(payload.error || "ライブラリの保存に失敗しました。");
      }

      setLibrary(payload.library);
      setStatus("ライブラリを保存しました。");
    } catch (error) {
      console.error("[video-library-client] save failed", error);
      setStatus(
        error instanceof Error
          ? error.message
          : "ライブラリの保存に失敗しました。",
      );
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

    if (hasNameConflict(library.root, parentId || null, name)) {
      setStatus("同じフォルダ内に同名のフォルダまたはリンクは追加できません。");
      return;
    }

    const nextRoot = addNode(library.root, parentId || null, {
      id: makeId(),
      type: mode,
      name: name.trim(),
      url: mode === "link" ? url.trim() : undefined,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
      children: mode === "folder" ? [] : undefined,
    });
    console.log("[video-library-client] handle add", {
      mode,
      parentId: parentId || null,
      name: name.trim(),
      url: mode === "link" ? url.trim() : null,
    });

    await saveLibrary(nextRoot);
    setName("");
    setUrl("");
    setNote("");
  }

  async function handleDelete(id: string) {
    console.log("[video-library-client] handle delete", { id });
    await saveLibrary(removeNode(library.root, id));
  }

  function handleEdit(node: VideoLibraryNode) {
    const found = findNode(library.root, node.id);
    setEditing({
      id: node.id,
      name: node.name,
      url: node.url ?? "",
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

    if (
      hasNameConflict(
        library.root,
        editing.parentId || null,
        editing.name,
        editing.id,
      )
    ) {
      setStatus("同じフォルダ内に同名のフォルダまたはリンクは保存できません。");
      return;
    }

    let nextRoot = updateNode(library.root, editing.id, (node) => ({
      ...node,
      name: editing.name.trim(),
      url: node.type === "link" ? editing.url.trim() : undefined,
      note: editing.note.trim() || undefined,
    }));
    console.log("[video-library-client] handle edit", {
      id: editing.id,
      parentId: editing.parentId,
      name: editing.name.trim(),
      url: editing.url.trim() || null,
    });

    if (found.parentId !== editing.parentId) {
      nextRoot = moveNode(nextRoot, editing.id, editing.parentId);
    }

    await saveLibrary(nextRoot);
    setEditing(null);
  }

  async function handleMove(id: string, direction: "up" | "down") {
    console.log("[video-library-client] handle move", { id, direction });
    await saveLibrary(reorderAtLevel(library.root, id, direction));
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-kicker">部内動画ライブラリ</div>
            <h1>{teamName ? `${teamName} 動画ライブラリ` : "YouTubeリンク集"}</h1>
            <p>
              試合外の参考動画、戦術動画、練習メニューなどを、チームごとのフォルダ構造で蓄積していくためのページです。
            </p>
          </div>
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">直下項目数</span>
              <strong>{library.root.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">更新日時</span>
              <strong>{formatJstDateTime(library.updatedAt)}</strong>
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
                ルート直下の `試合動画` フォルダは固定です。スタッツ連動の試合動画は必ずこの中へ入れつつ、それ以外のフォルダはルート直下にも自由に追加できます。
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

            {editing ? (
              <section className="panel-section soft-panel">
                <div className="section-heading">
                  <h3>項目編集</h3>
                  <p className="muted">名前変更、リンク更新、フォルダ移動を行います。</p>
                </div>

                <div className="field">
                  <label htmlFor="edit-name">名前</label>
                  <input
                    id="edit-name"
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
                  <label htmlFor="edit-parent">親フォルダ</label>
                  <select
                    id="edit-parent"
                    value={editing.parentId}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, parentId: event.target.value } : current,
                      )
                    }
                  >
                    <option value="">ルート</option>
                    {folders
                      .filter((folder) => !editingBlockedFolderIds.includes(folder.id))
                      .map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.label}
                      </option>
                      ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="edit-url">YouTube リンク</label>
                  <input
                    id="edit-url"
                    type="url"
                    value={editing.url}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, url: event.target.value } : current,
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label htmlFor="edit-note">メモ</label>
                  <textarea
                    id="edit-note"
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
