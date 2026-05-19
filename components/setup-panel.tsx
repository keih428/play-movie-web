"use client";

import { useState } from "react";
import type {
  SavedWorkspaceSummary,
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
  onParseFile: (file: File) => Promise<void>;
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
  onParseFile,
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  return (
    <section className="panel">
      <div className="panel-inner stack">
        <div>
          <h2>Setup Area</h2>
          <p className="muted">
            `.vsm` / `.vsdb` の取り込み、YouTube URL、オフセット設定をここに集約します。
          </p>
        </div>

        <div className="field">
          <label htmlFor="data-file">試合データファイル</label>
          <input
            id="data-file"
            type="file"
            accept=".vsm,.vsdb"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="youtube-url">YouTube URL</label>
          <input
            id="youtube-url"
            type="url"
            value={settings.youtubeUrl}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                youtubeUrl: event.target.value,
              })
            }
          />
        </div>

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

        <div className="field">
          <label htmlFor="time-mode">同期時刻の基準</label>
          <select
            id="time-mode"
            value={settings.useOriginalTime ? "original" : "time"}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                useOriginalTime: event.target.value === "original",
              })
            }
          >
            <option value="time">time</option>
            <option value="original">originalTime</option>
          </select>
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
            <option value="">Select workspace</option>
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
            disabled={!selectedFile || isParsing}
            onClick={() => {
              if (selectedFile) {
                void onParseFile(selectedFile);
              }
            }}
          >
            {isParsing ? "Parsing..." : "Parse Preview"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={onCaptureOffset}
          >
            現在位置を 0 秒に設定
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={onClearSavedWorkspace}
          >
            保存状態をクリア
          </button>
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
            {isSyncingWorkspace ? "Syncing..." : "サーバーへ保存"}
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
        </div>

        <div className="stack">
          <small className="muted">{status}</small>
          <small className="muted">
            share: {shareStatus ?? "not copied"}
          </small>
          <small className="muted">
            last saved: {lastSavedAt ?? "not saved yet"}
          </small>
          <small className="muted">
            server saved: {remoteSavedAt ?? "not saved yet"}
          </small>
          <small className="muted">
            store provider: {storeProvider ?? "unknown"}
          </small>
          <small className="muted">
            current video time:{" "}
            {typeof currentPlayerSeconds === "number"
              ? `${currentPlayerSeconds.toFixed(1)}s`
              : "n/a"}
          </small>
          {error ? <small style={{ color: "#8f2d16" }}>{error}</small> : null}
        </div>
      </div>
    </section>
  );
}
