"use client";

import { useEffect, useMemo, useState } from "react";
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

function getMatchVideos(library: VideoLibrary): VideoLibraryNode[] {
  const fixedFolder = library.root.find((node) => node.systemKey === "match-videos");
  return (fixedFolder?.children ?? []).filter(
    (node): node is VideoLibraryNode => node.type === "link" && Boolean(node.url),
  );
}

export function StaffSettingsClient({
  initialSettings,
  scoutLibrary,
  videoLibrary,
  workspaces,
}: StaffSettingsClientProps) {
  const [workspaceList, setWorkspaceList] = useState(workspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    initialSettings.defaultWorkspaceId ?? "",
  );
  const [landingMessage, setLandingMessage] = useState(
    initialSettings.landingMessage ?? "",
  );
  const [matchName, setMatchName] = useState("");
  const [scoutFileId, setScoutFileId] = useState("");
  const [prerollSeconds, setPrerollSeconds] = useState("3");
  const [useOriginalTime, setUseOriginalTime] = useState(false);
  const [setVideos, setSetVideos] = useState<VideoSyncSetSource[]>([]);
  const [selectedSetIndex, setSelectedSetIndex] = useState<number>();
  const [status, setStatus] = useState<string>();
  const [registerStatus, setRegisterStatus] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const scoutFileOptions = useMemo(
    () => flattenScoutFiles(scoutLibrary.root),
    [scoutLibrary.root],
  );
  const matchVideos = useMemo(() => getMatchVideos(videoLibrary), [videoLibrary]);
  const selectedSetVideo = setVideos.find(
    (entry) => entry.setIndex === selectedSetIndex,
  );

  function updateSelectedSetVideo(
    updater: (entry: VideoSyncSetSource) => VideoSyncSetSource,
  ) {
    if (typeof selectedSetIndex !== "number") {
      return;
    }

    setSetVideos((current) =>
      current.map((entry) =>
        entry.setIndex === selectedSetIndex ? updater(entry) : entry,
      ),
    );
  }

  useEffect(() => {
    if (!scoutFileId) {
      setSetVideos([]);
      setSelectedSetIndex(undefined);
      return;
    }

    let cancelled = false;

    async function loadScoutFile() {
      try {
        const response = await fetch(`/api/scout-files/${scoutFileId}`);
        const payload = (await response.json()) as {
          record?: {
            parsedCollection: ParsedCollection;
          };
          error?: string;
        };

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
          setSelectedSetIndex(nextSetVideos[0]?.setIndex);
        }
      } catch (error) {
        if (!cancelled) {
          setSetVideos([]);
          setSelectedSetIndex(undefined);
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
  }, [scoutFileId]);

  async function handleSave() {
    setIsSaving(true);
    setStatus(undefined);

    const selectedWorkspace = workspaceList.find(
      (workspace) => workspace.id === selectedWorkspaceId,
    );

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          defaultWorkspaceId: selectedWorkspaceId || undefined,
          defaultWorkspaceName: selectedWorkspace?.name,
          landingMessage: landingMessage.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("failed to save settings");
      }

      setStatus("スタッフ設定を保存しました。");
    } catch {
      setStatus("スタッフ設定の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

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
    if (setVideos.some((entry) => !entry.youtubeUrl)) {
      setRegisterStatus("各セットに試合動画を設定してください。");
      return;
    }

    setIsRegistering(true);
    setRegisterStatus(undefined);

    try {
      const scoutResponse = await fetch(`/api/scout-files/${scoutFileId}`);
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
        youtubeUrl: setVideos[0]?.youtubeUrl ?? "",
        offsetSeconds: setVideos[0]?.offsetSeconds ?? 0,
        prerollSeconds: Number(prerollSeconds) || 0,
        useOriginalTime,
        setVideos,
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
          },
        }),
      });
      const workspacePayload = (await workspaceResponse.json()) as {
        workspace?: SavedWorkspaceSummary & { id: string; createdAt: string; updatedAt: string };
        error?: string;
      };

      if (!workspaceResponse.ok || !workspacePayload.workspace) {
        throw new Error(workspacePayload.error || "試合の登録に失敗しました。");
      }

      const refreshResponse = await fetch("/api/workspaces");
      const refreshPayload = (await refreshResponse.json()) as {
        workspaces?: SavedWorkspaceSummary[];
      };
      const nextWorkspaces = refreshPayload.workspaces ?? workspaceList;
      setWorkspaceList(nextWorkspaces);
      setSelectedWorkspaceId(workspacePayload.workspace.id);
      setMatchName("");
      setScoutFileId("");
      setSetVideos([]);
      setSelectedSetIndex(undefined);
      setPrerollSeconds("3");
      setUseOriginalTime(false);
      setRegisterStatus("試合を登録しました。必要ならこのまま公開設定も保存してください。");
    } catch (error) {
      setRegisterStatus(
        error instanceof Error ? error.message : "試合の登録に失敗しました。",
      );
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>スタッフ公開設定</h2>
          <p className="muted">
            試合の登録と、一般部員向けホームで公開する試合の設定をここで行います。
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

          {setVideos.length > 0 ? (
            <section className="panel-section soft-panel">
              <div className="section-heading">
                <h3>セットごとの試合動画</h3>
                <p className="muted">
                  何セット目かを選んだうえで、そのセットに対応する動画リンクとオフセット秒を設定します。
                </p>
              </div>

              <div className="field">
                <label htmlFor="selected-set-index">対象セット</label>
                <select
                  id="selected-set-index"
                  value={selectedSetIndex ?? ""}
                  onChange={(event) => setSelectedSetIndex(Number(event.target.value))}
                >
                  {setVideos.map((entry) => (
                    <option key={entry.setIndex} value={entry.setIndex}>
                      セット {entry.setIndex}
                    </option>
                  ))}
                </select>
              </div>

              {selectedSetVideo ? (
                <div className="soft-panel">
                  <div className="section-heading">
                    <h3>セット {selectedSetVideo.setIndex} の設定</h3>
                  </div>
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor="selected-set-video">試合動画</label>
                      <select
                        id="selected-set-video"
                        value={selectedSetVideo.youtubeUrl}
                        onChange={(event) =>
                          updateSelectedSetVideo((entry) => ({
                            ...entry,
                            youtubeUrl: event.target.value,
                          }))
                        }
                      >
                        <option value="">試合動画を選択</option>
                        {matchVideos.map((video) => (
                          <option key={video.id} value={video.url}>
                            {video.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor="selected-set-offset">オフセット秒</label>
                      <input
                        id="selected-set-offset"
                        type="number"
                        value={selectedSetVideo.offsetSeconds}
                        onChange={(event) =>
                          updateSelectedSetVideo((entry) => ({
                            ...entry,
                            offsetSeconds: Number(event.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="workspace-list">
                {setVideos.map((entry) => (
                  <article className="workspace-card" key={entry.setIndex}>
                    <div className="list-item-header">
                      <strong>セット {entry.setIndex}</strong>
                      <span className="tag">
                        {entry.youtubeUrl ? "設定済み" : "未設定"}
                      </span>
                    </div>
                    <div className="meta-grid">
                      <div className="meta-card">
                        <span className="muted">動画</span>
                        <strong>{entry.youtubeUrl || "未選択"}</strong>
                      </div>
                      <div className="meta-card">
                        <span className="muted">オフセット</span>
                        <strong>{entry.offsetSeconds}s</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="field-grid">
            <div className="field">
              <label htmlFor="staff-preroll-seconds">プリロール秒</label>
              <input
                id="staff-preroll-seconds"
                type="number"
                value={prerollSeconds}
                onChange={(event) => setPrerollSeconds(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="staff-time-mode">同期時刻の基準</label>
              <select
                id="staff-time-mode"
                value={useOriginalTime ? "original" : "time"}
                onChange={(event) =>
                  setUseOriginalTime(event.target.value === "original")
                }
              >
                <option value="time">再生時刻</option>
                <option value="original">元時刻</option>
              </select>
              <p className="muted">
                `再生時刻` は通常の `time` を使い、`元時刻` はデータ内の `originalTime` を優先して使います。
              </p>
            </div>
          </div>

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
            <h3>現在の試合</h3>
            <p className="muted">
              ホームで既定表示する保存済みワークスペースを選択します。
            </p>
          </div>

          <div className="field">
            <label htmlFor="default-workspace">公開ワークスペース</label>
            <select
              id="default-workspace"
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            >
              <option value="">ワークスペースを選択</option>
              {workspaceList.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>ホーム文言</h3>
            <p className="muted">
              一般部員が最初に見るホームメッセージを任意で差し替えます。
            </p>
          </div>

          <div className="field">
            <label htmlFor="landing-message">ホームメッセージ</label>
            <textarea
              id="landing-message"
              rows={4}
              value={landingMessage}
              onChange={(event) => setLandingMessage(event.target.value)}
            />
          </div>
        </section>

        <div className="button-row">
          <button
            className="button"
            type="button"
            disabled={isSaving}
            onClick={() => {
              void handleSave();
            }}
          >
            {isSaving ? "保存中..." : "公開設定を保存"}
          </button>
        </div>

        {status ? <p className="muted">{status}</p> : null}
      </div>
    </section>
  );
}
