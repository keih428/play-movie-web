"use client";

import { useEffect, useState } from "react";
import type {
  SavedWorkspaceSummary,
  ScoutFileLibrary,
  ScoutFileNode,
  VideoLibrary,
  VideoLibraryNode,
  VideoSyncSettings,
  WorkspaceStoreProvider,
} from "@/lib/domain/types";

type SetupPanelProps = {
  settings: VideoSyncSettings;
  matchCount: number;
  matchOptions: Array<{
    index: number;
    label: string;
  }>;
  selectedMatchIndex: number;
  status: string;
  error: string | null;
  isParsing: boolean;
  currentPlayerSeconds?: number;
  lastSavedAt?: string;
  workspaceName: string;
  remoteWorkspaceId?: string;
  remoteSavedAt?: string;
  shareUrl?: string;
  shareStatus?: string;
  storeProvider?: WorkspaceStoreProvider;
  savedWorkspaces: SavedWorkspaceSummary[];
  isSyncingWorkspace: boolean;
  selectedScoutFileId?: string;
  onScoutFileChange: (fileId: string) => void;
  onLoadScoutFile: (fileId: string) => Promise<void>;
  onMatchChange: (index: number) => void;
  onSettingsChange: (settings: VideoSyncSettings) => void;
  onCaptureOffset: () => void;
  onClearSavedWorkspace: () => void;
  onWorkspaceNameChange: (name: string) => void;
  onRemoteWorkspaceChange: (id: string) => void;
  onSaveWorkspace: () => Promise<void>;
  onLoadWorkspace: () => Promise<void>;
  onDeleteWorkspace: () => Promise<void>;
  onRefreshWorkspaces: () => Promise<void>;
  onCopyShareUrl: () => Promise<void>;
};

type VideoLinkOption = VideoLibraryNode & {
  label: string;
};

function flattenScoutFiles(
  nodes: ScoutFileNode[],
  depth = 0,
): ScoutFileNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "file" && node.fileId) {
      return [
        {
          ...node,
          name: `${"  ".repeat(depth)}${node.name}`,
        },
      ];
    }

    return flattenScoutFiles(node.children ?? [], depth + 1);
  });
}

function flattenVideoLinks(
  nodes: VideoLibraryNode[],
  depth = 0,
): VideoLinkOption[] {
  return nodes.flatMap((node) => {
    if (node.type === "link" && node.url) {
      return [
        {
          ...node,
          label: `${"  ".repeat(depth)}${node.name}`,
        },
      ];
    }

    return flattenVideoLinks(node.children ?? [], depth + 1);
  });
}

export function SetupPanel({
  settings,
  matchCount,
  matchOptions,
  selectedMatchIndex,
  status,
  error,
  isParsing,
  currentPlayerSeconds,
  lastSavedAt,
  workspaceName,
  remoteWorkspaceId,
  remoteSavedAt,
  shareUrl,
  shareStatus,
  storeProvider,
  savedWorkspaces,
  isSyncingWorkspace,
  selectedScoutFileId,
  onScoutFileChange,
  onLoadScoutFile,
  onMatchChange,
  onSettingsChange,
  onCaptureOffset,
  onClearSavedWorkspace,
  onWorkspaceNameChange,
  onRemoteWorkspaceChange,
  onSaveWorkspace,
  onLoadWorkspace,
  onDeleteWorkspace,
  onRefreshWorkspaces,
  onCopyShareUrl,
}: SetupPanelProps) {
  const [matchVideoOptions, setMatchVideoOptions] = useState<VideoLinkOption[]>([]);
  const [scoutFileOptions, setScoutFileOptions] = useState<ScoutFileNode[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadLibraries() {
      try {
        const [videoResponse, scoutResponse] = await Promise.all([
          fetch("/api/video-library"),
          fetch("/api/scout-files"),
        ]);
        const videoPayload = (await videoResponse.json()) as {
          library?: VideoLibrary;
        };
        const scoutPayload = (await scoutResponse.json()) as {
          library?: ScoutFileLibrary;
        };
        if (!cancelled) {
          setMatchVideoOptions(flattenVideoLinks(videoPayload.library?.root ?? []));
          setScoutFileOptions(flattenScoutFiles(scoutPayload.library?.root ?? []));
        }
      } catch {
        if (!cancelled) {
          setMatchVideoOptions([]);
          setScoutFileOptions([]);
        }
      }
    }

    void loadLibraries();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>設定パネル</h2>
          <p className="muted">
            取り込み、同期、ワークスペース管理をここでまとめて操作します。
          </p>
        </div>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>試合データ読込</h3>
            <p className="muted">試合データライブラリから選択して、解析済み内容を反映します。</p>
          </div>

          <div className="field">
            <label htmlFor="scout-file">試合データ</label>
            <select
              id="scout-file"
              value={selectedScoutFileId ?? ""}
              onChange={(event) => onScoutFileChange(event.target.value)}
            >
              <option value="">試合データを選択</option>
              {scoutFileOptions.map((file) => (
                <option key={file.fileId} value={file.fileId}>
                  {file.name}
                </option>
              ))}
            </select>
          </div>

          {scoutFileOptions.length === 0 ? (
            <p className="muted">
              スタッフ用の `試合データ管理` ページで vsm / vsdb ファイルを登録すると、ここで選択できます。
            </p>
          ) : null}

          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={!selectedScoutFileId || isParsing}
              onClick={() => {
                if (selectedScoutFileId) {
                  void onLoadScoutFile(selectedScoutFileId);
                }
              }}
            >
              {isParsing ? "反映中..." : "読込して反映"}
            </button>
          </div>
        </section>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>動画同期</h3>
            <p className="muted">YouTube とプレイ時刻を合わせるための設定です。</p>
          </div>

          <div className="field">
            <label htmlFor="youtube-url">試合動画</label>
            <select
              id="youtube-url"
              value={settings.youtubeUrl}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  youtubeUrl: event.target.value,
                })
              }
            >
              <option value="">試合動画を選択</option>
              {matchVideoOptions.map((video) => (
                <option key={video.id} value={video.url}>
                  {video.label}
                </option>
              ))}
            </select>
          </div>

          {matchVideoOptions.length === 0 ? (
            <p className="muted">
              動画ライブラリの `試合動画` フォルダに YouTube リンクを追加すると、ここで選択できます。
            </p>
          ) : null}

          <div className="field-grid">
            <div className="field">
              <label htmlFor="offset-seconds">オフセット秒</label>
              <input
                id="offset-seconds"
                type="number"
                value={settings.offsetSeconds}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    offsetSeconds: Number(event.target.value) || 0,
                  })
                }
              />
            </div>

            <div className="field">
              <label htmlFor="preroll-seconds">プリロール秒</label>
              <input
                id="preroll-seconds"
                type="number"
                value={settings.prerollSeconds}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    prerollSeconds: Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          <p className="muted">
            動画同期は `.vsm` / `.vsdb` 内の `originalTime` を 30fps で秒換算して計算します。
          </p>

          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={onCaptureOffset}
            >
              現在位置を 0 秒に設定
            </button>
          </div>
        </section>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>ワークスペース管理</h3>
            <p className="muted">試合切替、保存、共有 URL の管理です。</p>
          </div>

          {matchCount > 1 ? (
            <div className="field">
              <label htmlFor="match-selector">表示中の試合</label>
              <select
                id="match-selector"
                value={selectedMatchIndex}
                onChange={(event) => onMatchChange(Number(event.target.value))}
              >
                {matchOptions.map((option) => (
                  <option key={option.index} value={option.index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="workspace-name">ワークスペース名</label>
            <input
              id="workspace-name"
              type="text"
              value={workspaceName}
              onChange={(event) => onWorkspaceNameChange(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="saved-workspace-selector">保存済みワークスペース</label>
            <select
              id="saved-workspace-selector"
              value={remoteWorkspaceId ?? ""}
              onChange={(event) => onRemoteWorkspaceChange(event.target.value)}
            >
              <option value="">ワークスペースを選択</option>
              {savedWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} ({workspace.matchCount} matches)
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="share-url">共有 URL</label>
            <input
              id="share-url"
              type="text"
              value={shareUrl ?? ""}
              readOnly
              placeholder="サーバー保存後に共有URLが表示されます"
            />
          </div>

          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isSyncingWorkspace}
              onClick={() => {
                void onSaveWorkspace();
              }}
            >
              {isSyncingWorkspace ? "保存中..." : "サーバーへ保存"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!remoteWorkspaceId || isSyncingWorkspace}
              onClick={() => {
                void onLoadWorkspace();
              }}
            >
              読み込む
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!remoteWorkspaceId || isSyncingWorkspace}
              onClick={() => {
                void onDeleteWorkspace();
              }}
            >
              削除
            </button>
          </div>

          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              disabled={isSyncingWorkspace}
              onClick={() => {
                void onRefreshWorkspaces();
              }}
            >
              一覧更新
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!shareUrl}
              onClick={() => {
                void onCopyShareUrl();
              }}
            >
              共有URLをコピー
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={onClearSavedWorkspace}
            >
              保存状態をクリア
            </button>
          </div>
        </section>

        <section className="panel-section soft-panel">
          <div className="section-heading">
            <h3>状態</h3>
            <p className="muted">現在の処理状況と同期状態を表示します。</p>
          </div>

          <div className="status-list">
            <div className="status-row">
              <span>状態</span>
              <strong>{status}</strong>
            </div>
            <div className="status-row">
              <span>共有</span>
              <strong>{shareStatus ?? "未コピー"}</strong>
            </div>
            <div className="status-row">
              <span>ローカル保存</span>
              <strong>{lastSavedAt ?? "未保存"}</strong>
            </div>
            <div className="status-row">
              <span>サーバー保存</span>
              <strong>{remoteSavedAt ?? "未保存"}</strong>
            </div>
            <div className="status-row">
              <span>保存先</span>
              <strong>{storeProvider ?? "不明"}</strong>
            </div>
            <div className="status-row">
              <span>動画時刻</span>
              <strong>
                {typeof currentPlayerSeconds === "number"
                  ? `${currentPlayerSeconds.toFixed(1)}s`
                  : "未取得"}
              </strong>
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </section>
      </div>
    </section>
  );
}
