"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTeamApiPath,
  buildTeamDataLibraryPath,
  buildTeamVideosPath,
} from "@/lib/domain/team";
import type {
  ParsedCollection,
  SavedWorkspaceSummary,
  ScoutFileLibrary,
  ScoutFileNode,
  StaffAppSettings,
  VideoLibrary,
  VideoLibraryNode,
  VideoSyncSetSource,
  VideoSyncSettings,
} from "@/lib/domain/types";

type StaffSettingsClientProps = {
  initialSettings: StaffAppSettings;
  scoutLibrary: ScoutFileLibrary;
  videoLibrary: VideoLibrary;
  workspaces: SavedWorkspaceSummary[];
  teamName?: string;
  teamSlug?: string;
};

function flattenScoutFiles(
  nodes: ScoutFileNode[],
  depth = 0,
): Array<{ fileId: string; label: string }> {
  return nodes.flatMap((node) => {
    if (node.type === "file" && node.fileId) {
      return [
        {
          fileId: node.fileId,
          label: `${"  ".repeat(depth)}${node.name}`,
        },
      ];
    }

    return flattenScoutFiles(node.children ?? [], depth + 1);
  });
}

function flattenVideoLinks(
  nodes: VideoLibraryNode[],
): Array<VideoLibraryNode & { label: string }> {
  const matchVideosFolder = nodes.find((node) => node.systemKey === "match-videos");
  if (!matchVideosFolder || matchVideosFolder.type !== "folder") {
    return [];
  }

  function walk(
    entries: VideoLibraryNode[],
    parents: string[] = [],
  ): Array<VideoLibraryNode & { label: string }> {
    return entries.flatMap((node) => {
      if (node.type === "link" && node.url) {
        return [
          {
            ...node,
            label: [...parents, node.name].join("/"),
          },
        ];
      }

      return walk(node.children ?? [], [...parents, node.name]);
    });
  }

  return walk(matchVideosFolder.children ?? []);
}

function getInheritedSetVideo(
  setVideos: VideoSyncSetSource[],
  setIndex: number,
): VideoSyncSetSource | undefined {
  return setVideos
    .filter((entry) => entry.youtubeUrl && entry.setIndex <= setIndex)
    .sort((left, right) => left.setIndex - right.setIndex)
    .at(-1);
}

export function StaffSettingsClient({
  initialSettings,
  scoutLibrary,
  videoLibrary,
  workspaces,
  teamName,
  teamSlug,
}: StaffSettingsClientProps) {
  const [currentScoutLibrary, setCurrentScoutLibrary] = useState(scoutLibrary);
  const [currentVideoLibrary, setCurrentVideoLibrary] = useState(videoLibrary);
  const [currentWorkspaces, setCurrentWorkspaces] = useState(workspaces);
  const [matchName, setMatchName] = useState("");
  const [scoutFileId, setScoutFileId] = useState("");
  const [setVideos, setSetVideos] = useState<VideoSyncSetSource[]>([]);
  const [registerStatus, setRegisterStatus] = useState<string>();
  const [libraryStatus, setLibraryStatus] = useState<string>();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRefreshingLibraries, setIsRefreshingLibraries] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string>();
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("");
  const [isUpdatingWorkspace, setIsUpdatingWorkspace] = useState(false);

  const scoutFileOptions = useMemo(
    () => flattenScoutFiles(currentScoutLibrary.root),
    [currentScoutLibrary.root],
  );
  const matchVideos = useMemo(
    () => flattenVideoLinks(currentVideoLibrary.root),
    [currentVideoLibrary.root],
  );

  const refreshWorkspaces = useCallback(async () => {
    const response = await fetch("/api/workspaces", { cache: "no-store" });
    const payload = (await response.json()) as {
      workspaces?: SavedWorkspaceSummary[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "試合一覧の取得に失敗しました。");
    }

    setCurrentWorkspaces(
      (payload.workspaces ?? []).filter((workspace) =>
        teamSlug ? workspace.teamSlug === teamSlug : true,
      ),
    );
  }, [teamSlug]);

  const refreshLibraries = useCallback(async () => {
    setIsRefreshingLibraries(true);

    try {
      const [scoutResponse, videoResponse] = await Promise.all([
        fetch(buildTeamApiPath("/api/scout-files", teamSlug), { cache: "no-store" }),
        fetch(buildTeamApiPath("/api/video-library", teamSlug), { cache: "no-store" }),
      ]);
      const scoutPayload = (await scoutResponse.json()) as {
        library?: ScoutFileLibrary;
        error?: string;
      };
      const videoPayload = (await videoResponse.json()) as {
        library?: VideoLibrary;
        error?: string;
      };

      if (!scoutResponse.ok) {
        throw new Error(
          scoutPayload.error || "試合データライブラリの取得に失敗しました。",
        );
      }
      if (!videoResponse.ok) {
        throw new Error(
          videoPayload.error || "動画リンクライブラリの取得に失敗しました。",
        );
      }

      console.log("[staff-settings] refreshLibraries", {
        scoutStatus: scoutResponse.status,
        scoutRootCount: scoutPayload.library?.root.length ?? null,
        videoStatus: videoResponse.status,
        videoRootCount: videoPayload.library?.root.length ?? null,
      });

      if (scoutPayload.library) {
        setCurrentScoutLibrary(scoutPayload.library);
      }
      if (videoPayload.library) {
        setCurrentVideoLibrary(videoPayload.library);
      }
      setLibraryStatus(undefined);
    } catch (error) {
      setLibraryStatus(
        error instanceof Error
          ? error.message
          : "ライブラリの再読込に失敗しました。",
      );
    } finally {
      setIsRefreshingLibraries(false);
    }
  }, [teamSlug]);

  useEffect(() => {
    void refreshLibraries();
  }, [refreshLibraries]);

  function updateSetVideo(
    setIndex: number,
    updater: (entry: VideoSyncSetSource) => VideoSyncSetSource,
  ) {
    setSetVideos((current) =>
      current.map((entry) =>
        entry.setIndex === setIndex ? updater(entry) : entry,
      ),
    );
  }

  useEffect(() => {
    if (!scoutFileId) {
      setSetVideos([]);
      return;
    }

    let cancelled = false;

    async function loadScoutFile() {
      try {
        const response = await fetch(
          buildTeamApiPath(`/api/scout-files/${scoutFileId}`, teamSlug),
        );
        const payload = (await response.json()) as {
          record?: {
            parsedCollection: ParsedCollection;
          };
          error?: string;
        };

        console.log("[staff-settings] loadScoutFile", {
          scoutFileId,
          status: response.status,
          hasRecord: Boolean(payload.record),
          error: payload.error ?? null,
        });

        if (!response.ok || !payload.record) {
          throw new Error(payload.error || "試合データの読込に失敗しました。");
        }

        const firstMatch = payload.record.parsedCollection.matches[0];
        const nextSetVideos =
          firstMatch?.sets.map((set) => ({
            setIndex: set.setIndex,
            youtubeUrl: "",
            offsetSeconds: 0,
          })) ?? [];

        if (!cancelled) {
          setSetVideos(nextSetVideos);
        }
      } catch (error) {
        if (!cancelled) {
          setSetVideos([]);
          setRegisterStatus(
            error instanceof Error
              ? error.message
              : "試合データの読込に失敗しました。",
          );
        }
      }
    }

    void loadScoutFile();
    return () => {
      cancelled = true;
    };
  }, [scoutFileId, teamSlug]);

  async function handleRegisterMatch() {
    if (!matchName.trim()) {
      setRegisterStatus("試合名を入力してください。");
      return;
    }
    if (!scoutFileId) {
      setRegisterStatus("試合データを選択してください。");
      return;
    }
    if (setVideos.length === 0) {
      setRegisterStatus("セット情報を取得できませんでした。");
      return;
    }
    const configuredSetVideos = setVideos.filter((entry) => entry.youtubeUrl);
    if (configuredSetVideos.length === 0) {
      setRegisterStatus("少なくとも1つのセットに試合動画を設定してください。");
      return;
    }

    setIsRegistering(true);
    setRegisterStatus(undefined);

    try {
      const scoutResponse = await fetch(
        buildTeamApiPath(`/api/scout-files/${scoutFileId}`, teamSlug),
      );
      const scoutPayload = (await scoutResponse.json()) as {
        record?: {
          parsedCollection: ParsedCollection;
          fileName: string;
        };
        error?: string;
      };

      if (!scoutResponse.ok || !scoutPayload.record) {
        throw new Error(scoutPayload.error || "試合データの読込に失敗しました。");
      }

      const workspaceSettings: VideoSyncSettings = {
        youtubeUrl: configuredSetVideos[0]?.youtubeUrl ?? "",
        offsetSeconds: configuredSetVideos[0]?.offsetSeconds ?? 0,
        prerollSeconds: 0,
        setVideos: configuredSetVideos,
      };

      const workspaceResponse = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: matchName.trim(),
          workspace: {
            collection: scoutPayload.record.parsedCollection,
            settings: workspaceSettings,
            selectedMatchIndex: 0,
            teamName,
            teamSlug,
          },
        }),
      });
      const workspacePayload = (await workspaceResponse.json()) as {
        workspace?: SavedWorkspaceSummary & { id: string; createdAt: string; updatedAt: string };
        error?: string;
      };

      console.log("[staff-settings] register workspace", {
        status: workspaceResponse.status,
        workspaceId: workspacePayload.workspace?.id ?? null,
        error: workspacePayload.error ?? null,
      });

      if (!workspaceResponse.ok || !workspacePayload.workspace) {
        throw new Error(workspacePayload.error || "試合の登録に失敗しました。");
      }

      setMatchName("");
      setScoutFileId("");
      setSetVideos([]);
      await refreshWorkspaces();
      setRegisterStatus("試合を登録しました。");
    } catch (error) {
      setRegisterStatus(
        error instanceof Error ? error.message : "試合の登録に失敗しました。",
      );
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleDeleteWorkspace(workspaceId: string) {
    setIsUpdatingWorkspace(true);
    setRegisterStatus(undefined);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "試合の削除に失敗しました。");
      }

      await refreshWorkspaces();
      setRegisterStatus("試合を削除しました。");
    } catch (error) {
      setRegisterStatus(
        error instanceof Error ? error.message : "試合の削除に失敗しました。",
      );
    } finally {
      setIsUpdatingWorkspace(false);
    }
  }

  async function handleRenameWorkspace(workspaceId: string) {
    if (!editingWorkspaceName.trim()) {
      setRegisterStatus("試合名を入力してください。");
      return;
    }

    setIsUpdatingWorkspace(true);
    setRegisterStatus(undefined);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editingWorkspaceName.trim(),
        }),
      });
      const payload = (await response.json()) as {
        workspace?: SavedWorkspaceSummary;
        error?: string;
      };

      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error || "試合名の更新に失敗しました。");
      }

      await refreshWorkspaces();
      setEditingWorkspaceId(undefined);
      setEditingWorkspaceName("");
      setRegisterStatus("試合名を更新しました。");
    } catch (error) {
      setRegisterStatus(
        error instanceof Error ? error.message : "試合名の更新に失敗しました。",
      );
    } finally {
      setIsUpdatingWorkspace(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>設定</h2>
          <p className="muted">
            試合の登録と動画紐づけをここで行います。
          </p>
        </div>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>試合を登録する</h3>
            <p className="muted">
              試合名、試合データ、試合動画を紐づけて、試合一覧から閲覧できる形で保存します。
            </p>
          </div>

          <div className="field">
            <label htmlFor="match-name">試合名</label>
            <input
              id="match-name"
              type="text"
              value={matchName}
              onChange={(event) => setMatchName(event.target.value)}
              placeholder="例: 2026 春季リーグ vs 慶應"
            />
          </div>

          <div className="field">
            <label htmlFor="staff-scout-file">試合データ</label>
            <select
              id="staff-scout-file"
              value={scoutFileId}
              onChange={(event) => {
                setRegisterStatus(undefined);
                setScoutFileId(event.target.value);
              }}
            >
              <option value="">試合データを選択</option>
              {scoutFileOptions.map((file) => (
                <option key={file.fileId} value={file.fileId}>
                  {file.label}
                </option>
              ))}
            </select>
          </div>

          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              disabled={isRefreshingLibraries}
              onClick={() => {
                void refreshLibraries();
              }}
            >
              {isRefreshingLibraries ? "再読込中..." : "候補を再読込"}
            </button>
          </div>

          {libraryStatus ? <p className="muted">{libraryStatus}</p> : null}
          <p className="muted">
            試合データ候補 {scoutFileOptions.length} 件 /
            動画リンク候補 {matchVideos.length} 件
          </p>

          {scoutFileOptions.length === 0 ? (
            <p className="muted">
              まだ候補がありません。<Link href={teamSlug ? buildTeamDataLibraryPath(teamSlug) : "/staff/data-library"}>試合データ管理</Link>
              で `.vsm` / `.vsdb` を登録したあと、この画面で `候補を再読込` を押してください。
            </p>
          ) : null}

          {matchVideos.length === 0 ? (
            <p className="muted">
              まだ動画リンク候補がありません。<Link href={teamSlug ? buildTeamVideosPath(teamSlug) : "/videos"}>動画ライブラリ</Link>
              で YouTube リンクを追加したあと、この画面で `候補を再読込` を押してください。
            </p>
          ) : null}

          <section className="panel-section soft-panel">
            <div className="section-heading">
              <h3>セットごとの試合動画</h3>
                <p className="muted">
                `.vsm` / `.vsdb` を選ぶとセット数に応じた紐づけ欄が出ます。動画が切り替わるセットだけ YouTube リンクとオフセット秒を設定すると、未設定のセットは直前の設定を引き継ぎます。
                </p>
              </div>

            {setVideos.length > 0 ? (
              <>
              <div className="workspace-list">
                {setVideos.map((entry) => {
                  const inheritedEntry = getInheritedSetVideo(setVideos, entry.setIndex);
                  const effectiveEntry = entry.youtubeUrl ? entry : inheritedEntry;

                  return (
                  <article className="workspace-card" key={entry.setIndex}>
                    <div className="list-item-header">
                      <strong>セット {entry.setIndex}</strong>
                      <span className="tag">
                        {entry.youtubeUrl
                          ? "このセットから切替"
                          : effectiveEntry?.youtubeUrl
                            ? `セット ${effectiveEntry.setIndex} を継承`
                            : "未設定"}
                      </span>
                    </div>
                    <div className="meta-grid">
                      <div className="meta-card">
                        <span className="muted">動画</span>
                        <strong>{effectiveEntry?.youtubeUrl || "未選択"}</strong>
                      </div>
                      <div className="meta-card">
                        <span className="muted">オフセット</span>
                        <strong>{effectiveEntry?.offsetSeconds ?? 0}s</strong>
                      </div>
                    </div>
                    <div className="field-grid">
                      <div className="field">
                        <label htmlFor={`selected-set-video-${entry.setIndex}`}>
                          試合動画
                        </label>
                        <select
                          id={`selected-set-video-${entry.setIndex}`}
                          value={entry.youtubeUrl}
                          onChange={(event) =>
                            updateSetVideo(entry.setIndex, (current) => ({
                              ...current,
                              youtubeUrl: event.target.value,
                            }))
                          }
                        >
                          <option value="">試合動画を選択</option>
                          {matchVideos.map((video) => (
                            <option key={video.id} value={video.url}>
                              {video.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor={`selected-set-offset-${entry.setIndex}`}>
                          オフセット秒
                        </label>
                        <input
                          id={`selected-set-offset-${entry.setIndex}`}
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={entry.offsetSeconds}
                          onChange={(event) =>
                            updateSetVideo(entry.setIndex, (current) => ({
                              ...current,
                              offsetSeconds: Number(event.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </article>
                )})}
              </div>
              </>
            ) : (
              <p className="muted">
                まず上の `試合データ` で `.vsm` / `.vsdb` を選択してください。選択後にセットごとの YouTube リンク選択コンポーネントが表示されます。
              </p>
            )}
          </section>

          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isRegistering}
              onClick={() => {
                void handleRegisterMatch();
              }}
            >
              {isRegistering ? "登録中..." : "試合を登録"}
            </button>
          </div>

          {registerStatus ? <p className="muted">{registerStatus}</p> : null}
        </section>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>登録済み試合を管理する</h3>
            <p className="muted">
              ここから試合名の編集と削除ができます。
            </p>
          </div>

          {currentWorkspaces.length === 0 ? (
            <p className="muted">このチームで登録済みの試合はまだありません。</p>
          ) : (
            <div className="workspace-list">
              {currentWorkspaces.map((workspace) => (
                <article className="workspace-card" key={workspace.id}>
                  {editingWorkspaceId === workspace.id ? (
                    <div className="stack">
                      <div className="field">
                        <label htmlFor={`edit-workspace-${workspace.id}`}>試合名</label>
                        <input
                          id={`edit-workspace-${workspace.id}`}
                          type="text"
                          value={editingWorkspaceName}
                          onChange={(event) => setEditingWorkspaceName(event.target.value)}
                        />
                      </div>
                      <div className="button-row">
                        <button
                          className="button"
                          type="button"
                          disabled={isUpdatingWorkspace}
                          onClick={() => {
                            void handleRenameWorkspace(workspace.id);
                          }}
                        >
                          保存
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => {
                            setEditingWorkspaceId(undefined);
                            setEditingWorkspaceName("");
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="list-item-header">
                        <strong>{workspace.name}</strong>
                        <span className="tag">{workspace.setScoreLabel ?? "-"}</span>
                      </div>
                      <p className="muted">
                        {workspace.matchLabel ?? "対戦カード未設定"} / {workspace.resultLabel ?? "結果未取得"}
                      </p>
                      <div className="button-row">
                        <button
                          className="button secondary"
                          type="button"
                          disabled={isUpdatingWorkspace}
                          onClick={() => {
                            setEditingWorkspaceId(workspace.id);
                            setEditingWorkspaceName(workspace.name);
                          }}
                        >
                          名前を編集
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={isUpdatingWorkspace}
                          onClick={() => {
                            void handleDeleteWorkspace(workspace.id);
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

      </div>
    </section>
  );
}
