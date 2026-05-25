"use client";

import { startTransition, useEffect, useState } from "react";
import { AnalysisPanel } from "@/components/analysis-panel";
import { Filters } from "@/components/filters";
import { PlayList } from "@/components/play-list";
import { RotationPanel } from "@/components/rotation-panel";
import { SetupPanel } from "@/components/setup-panel";
import { VideoPlayer } from "@/components/video-player";
import type {
  ParsedCollection,
  ParsedMatch,
  ParsedPlay,
  PersistedWorkspace,
  SavedWorkspaceRecord,
  SavedWorkspaceSummary,
  VideoSyncSettings,
  WorkspaceStoreProvider,
} from "@/lib/domain/types";

type FilterState = {
  team: string;
  player: string;
  skill: string;
};

type DashboardTab = "workspace" | "video" | "plays" | "analysis";

type HomeClientProps = {
  allowEditing?: boolean;
  initialCollection: ParsedCollection;
  initialSettings: VideoSyncSettings;
  initialWorkspaceId?: string;
  initialWorkspaceName?: string;
  initialRemoteSavedAt?: string;
  initialStatus?: string;
  skipLocalRestore?: boolean;
  landingMessage?: string;
};

const WORKSPACE_STORAGE_KEY = "play-movie-web.workspace.v1";

function countPlays(match: ParsedMatch | undefined): number {
  if (!match) {
    return 0;
  }

  return match.sets.reduce(
    (sum, set) =>
      sum + set.events.reduce((inner, event) => inner + event.plays.length, 0),
    0,
  );
}

function getFilterOptions(match: ParsedMatch | undefined) {
  const teams = new Set<string>();
  const players = new Set<string>();
  const skills = new Set<string>();

  match?.sets.forEach((set) => {
    set.events.forEach((event) => {
      event.plays.forEach((play) => {
        if (play.team) {
          teams.add(play.team);
        }
        if (play.player) {
          players.add(play.player);
        }
        if (play.skill) {
          skills.add(play.skill);
        }
      });
    });
  });

  return {
    teams: [...teams].sort(),
    players: [...players].sort(),
    skills: [...skills].sort(),
  };
}

function getFilteredMatch(
  match: ParsedMatch | undefined,
  filters: FilterState,
): ParsedMatch | undefined {
  if (!match) {
    return undefined;
  }

  return {
    ...match,
    sets: match.sets
      .map((set) => ({
        ...set,
        events: set.events
          .map((event) => ({
            ...event,
            plays: event.plays.filter((play) => {
              if (filters.team !== "all" && play.team !== filters.team) {
                return false;
              }
              if (filters.player !== "all" && play.player !== filters.player) {
                return false;
              }
              if (filters.skill !== "all" && play.skill !== filters.skill) {
                return false;
              }
              return true;
            }),
          }))
          .filter((event) => event.plays.length > 0),
      }))
      .filter((set) => set.events.length > 0),
  };
}

export function HomeClient({
  allowEditing = false,
  initialCollection,
  initialSettings,
  initialWorkspaceId,
  initialWorkspaceName,
  initialRemoteSavedAt,
  initialStatus,
  skipLocalRestore,
  landingMessage,
}: HomeClientProps) {
  const [collection, setCollection] = useState(initialCollection);
  const [settings, setSettings] = useState(initialSettings);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    team: "all",
    player: "all",
    skill: "all",
  });
  const [status, setStatus] = useState(initialStatus ?? "試合データの準備ができています");
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedPlay, setSelectedPlay] = useState<ParsedPlay | undefined>();
  const [currentPlayerSeconds, setCurrentPlayerSeconds] = useState<number>();
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [hasHydratedWorkspace, setHasHydratedWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(
    initialWorkspaceName ?? "東大バレー部ワークスペース",
  );
  const [remoteWorkspaceId, setRemoteWorkspaceId] = useState<string | undefined>(
    initialWorkspaceId,
  );
  const [remoteSavedAt, setRemoteSavedAt] = useState<string | undefined>(
    initialRemoteSavedAt,
  );
  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedWorkspaceSummary[]>([]);
  const [isSyncingWorkspace, setIsSyncingWorkspace] = useState(false);
  const [shareStatus, setShareStatus] = useState<string>();
  const [storeProvider, setStoreProvider] = useState<WorkspaceStoreProvider>();
  const [activeTab, setActiveTab] = useState<DashboardTab>("workspace");

  const hasMatches = collection.matches.length > 0;
  const match = collection.matches[selectedMatchIndex];
  const filteredMatch = getFilteredMatch(match, filters);
  const playCount = countPlays(filteredMatch);
  const filterOptions = getFilterOptions(match);
  const shareUrl =
    typeof window !== "undefined" && remoteWorkspaceId
      ? (() => {
          const url = new URL(window.location.href);
          url.searchParams.set("workspaceId", remoteWorkspaceId);
          return url.toString();
        })()
      : undefined;

  async function refreshSavedWorkspaces() {
    const response = await fetch("/api/workspaces");
    const payload = (await response.json()) as {
      provider?: WorkspaceStoreProvider;
      workspaces?: SavedWorkspaceSummary[];
    };
    setStoreProvider(payload.provider);
    setSavedWorkspaces(payload.workspaces ?? []);
  }

  useEffect(() => {
    if (skipLocalRestore) {
      window.setTimeout(() => {
        setHasHydratedWorkspace(true);
      }, 0);
      return;
    }

    const finalize = () => {
      window.setTimeout(() => {
        setHasHydratedWorkspace(true);
      }, 0);
    };

    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!raw) {
        finalize();
        return;
      }

      const persisted = JSON.parse(raw) as PersistedWorkspace;
      if (
        !persisted ||
        !persisted.collection ||
        !persisted.settings ||
        !Array.isArray(persisted.collection.matches)
      ) {
        finalize();
        return;
      }

      window.setTimeout(() => {
        setCollection(persisted.collection);
        setSettings(persisted.settings);
        setSelectedMatchIndex(
          Math.max(
            0,
            Math.min(
              persisted.selectedMatchIndex ?? 0,
              Math.max(0, persisted.collection.matches.length - 1),
            ),
          ),
        );
        setLastSavedAt(persisted.savedAt);
        setStatus("Restored saved workspace");
        setHasHydratedWorkspace(true);
      }, 0);
    } catch {
      window.setTimeout(() => {
        setStatus("Failed to restore saved workspace");
        setHasHydratedWorkspace(true);
      }, 0);
    }
  }, [skipLocalRestore]);

  useEffect(() => {
    window.setTimeout(() => {
      void refreshSavedWorkspaces();
    }, 0);
  }, []);

  useEffect(() => {
    if (!hasHydratedWorkspace) {
      return;
    }

    const persisted: PersistedWorkspace = {
      collection,
      settings,
      selectedMatchIndex,
      savedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify(persisted),
      );
      window.setTimeout(() => {
        setLastSavedAt(persisted.savedAt);
      }, 0);
    } catch {
      window.setTimeout(() => {
        setError("failed to save workspace to localStorage");
      }, 0);
    }
  }, [collection, settings, selectedMatchIndex, hasHydratedWorkspace]);

  async function handleParseFile(file: File) {
    setError(null);
    setStatus(`Parsing ${file.name} ...`);
    setIsParsing(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as ParsedCollection & {
        error?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "parse failed");
      }

      startTransition(() => {
        setCollection(payload);
        setSelectedMatchIndex(0);
        setSelectedPlay(undefined);
        setWorkspaceName(file.name.replace(/\.[^.]+$/, ""));
        setActiveTab("video");
        setFilters({
          team: "all",
          player: "all",
          skill: "all",
        });
      });
      setStatus(`Parsed ${file.name}`);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "parse failed");
      setStatus("Parse failed");
    } finally {
      setIsParsing(false);
    }
  }

  function handleCaptureOffset() {
    if (typeof currentPlayerSeconds !== "number") {
      setStatus("Player time is not available");
      return;
    }

    setSettings((current) => ({
      ...current,
      offsetSeconds: Math.floor(currentPlayerSeconds),
    }));
    setStatus(`Offset set to ${Math.floor(currentPlayerSeconds)}s`);
  }

  function handleMatchChange(index: number) {
    setSelectedMatchIndex(index);
    setSelectedPlay(undefined);
    setFilters({
      team: "all",
      player: "all",
      skill: "all",
    });
  }

  function handleFiltersChange(nextFilters: FilterState) {
    setFilters(nextFilters);
    setSelectedPlay(undefined);
  }

  function handleClearSavedWorkspace() {
    try {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      setCollection(initialCollection);
      setSettings(initialSettings);
      setSelectedMatchIndex(0);
      setFilters({
        team: "all",
        player: "all",
        skill: "all",
      });
      setSelectedPlay(undefined);
      setLastSavedAt(undefined);
      setRemoteWorkspaceId(undefined);
      setRemoteSavedAt(undefined);
      setActiveTab("workspace");
      setStatus("Saved workspace cleared");
      setError(null);
    } catch {
      setError("failed to clear saved workspace");
    }
  }

  function buildPersistedWorkspace(): PersistedWorkspace {
    return {
      collection,
      settings,
      selectedMatchIndex,
      savedAt: new Date().toISOString(),
    };
  }

  async function handleSaveWorkspace() {
    setError(null);
    setIsSyncingWorkspace(true);
    setStatus("Saving workspace to server ...");

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: remoteWorkspaceId,
          name: workspaceName,
          workspace: buildPersistedWorkspace(),
        }),
      });
      const payload = (await response.json()) as {
        provider?: WorkspaceStoreProvider;
        workspace?: SavedWorkspaceRecord;
        error?: string;
      };

      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error || "failed to save workspace");
      }

      setRemoteWorkspaceId(payload.workspace.id);
      setRemoteSavedAt(payload.workspace.updatedAt);
      setWorkspaceName(payload.workspace.name);
      setShareStatus("ready to copy");
      setStoreProvider(payload.provider);
      await refreshSavedWorkspaces();
      setStatus(`Saved workspace ${payload.workspace.name}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "save failed");
      setStatus("Server save failed");
    } finally {
      setIsSyncingWorkspace(false);
    }
  }

  async function handleLoadWorkspace() {
    if (!remoteWorkspaceId) {
      return;
    }

    setError(null);
    setIsSyncingWorkspace(true);
    setStatus("Loading workspace from server ...");

    try {
      const response = await fetch(`/api/workspaces/${remoteWorkspaceId}`);
      const payload = (await response.json()) as {
        provider?: WorkspaceStoreProvider;
        workspace?: SavedWorkspaceRecord;
        error?: string;
      };

      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error || "failed to load workspace");
      }

      const workspace = payload.workspace;

      startTransition(() => {
        setCollection(workspace.collection);
        setSettings(workspace.settings);
        setSelectedMatchIndex(workspace.selectedMatchIndex);
        setSelectedPlay(undefined);
        setActiveTab("workspace");
        setFilters({
          team: "all",
          player: "all",
          skill: "all",
        });
        setWorkspaceName(workspace.name);
        setRemoteSavedAt(workspace.updatedAt);
        setLastSavedAt(workspace.savedAt);
        setShareStatus("ready to copy");
        setStoreProvider(payload.provider);
      });
      setStatus(`Loaded workspace ${workspace.name}`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "load failed");
      setStatus("Server load failed");
    } finally {
      setIsSyncingWorkspace(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!remoteWorkspaceId) {
      return;
    }

    setError(null);
    setIsSyncingWorkspace(true);
    setStatus("Deleting workspace from server ...");

    try {
      const response = await fetch(`/api/workspaces/${remoteWorkspaceId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        provider?: WorkspaceStoreProvider;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "failed to delete workspace");
      }

      setRemoteWorkspaceId(undefined);
      setRemoteSavedAt(undefined);
      setShareStatus(undefined);
      setStoreProvider(payload.provider);
      await refreshSavedWorkspaces();
      setStatus("Workspace deleted");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "delete failed",
      );
      setStatus("Server delete failed");
    } finally {
      setIsSyncingWorkspace(false);
    }
  }

  async function handleCopyShareUrl() {
    if (!shareUrl) {
      setShareStatus("share url is not available");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("copied");
    } catch {
      setShareStatus("copy failed");
      setError("failed to copy share url");
    }
  }

  const setupPanelProps = {
    settings,
    matchCount: collection.matches.length,
    matchOptions: collection.matches.map((entry, index) => ({
      index,
      label: `${index + 1}. ${entry.teams.home.name} vs ${entry.teams.away.name}`,
    })),
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
    onParseFile: handleParseFile,
    onMatchChange: handleMatchChange,
    onSettingsChange: setSettings,
    onCaptureOffset: handleCaptureOffset,
    onClearSavedWorkspace: handleClearSavedWorkspace,
    onWorkspaceNameChange: setWorkspaceName,
    onRemoteWorkspaceChange: setRemoteWorkspaceId,
    onSaveWorkspace: handleSaveWorkspace,
    onLoadWorkspace: handleLoadWorkspace,
    onDeleteWorkspace: handleDeleteWorkspace,
    onRefreshWorkspaces: refreshSavedWorkspaces,
    onCopyShareUrl: handleCopyShareUrl,
  };

  return (
    <main className="page-shell">
      <section className="hero hero-home">
        <div className="hero-grid">
          <div>
            <div className="hero-kicker">東京大学運動会バレー部 専用</div>
            <h1>東大バレー部 試合ビューア</h1>
            <p>
              東京大学運動会バレー部の試合データを整理し、動画同期、プレイ確認、
              ローテーション分析までをひとつのワークスペースで扱うための専用ツールです。
            </p>
            <div className="badge-row">
              <span className="badge">部内向けツール</span>
              <span className="badge">試合レビュー</span>
              <span className="badge">映像連動分析</span>
            </div>
          </div>

          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">試合数</span>
              <strong>{collection.matches.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">セット数</span>
              <strong>{filteredMatch?.sets.length ?? 0}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">表示プレイ数</span>
              <strong>{playCount}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">表示モード</span>
              <strong>{hasMatches ? collection.sourceType.toUpperCase() : "ホーム"}</strong>
            </div>
          </div>
        </div>
      </section>

      {hasMatches ? (
        <section className="dashboard-shell">
          <div className="dashboard-header">
            <div>
              <h2>試合ワークスペース</h2>
              <p className="muted">
                {allowEditing
                  ? "主要機能をタブで切り替えながら、読み込み・同期・分析を進めます。"
                  : "公開された試合ワークスペースを、閲覧と分析に集中できる形で表示します。"}
              </p>
            </div>
            <div className="tab-row" role="tablist" aria-label="画面切替">
              {[
                ["workspace", "概要"],
                ["video", "動画"],
                ["plays", "プレイ"],
                ["analysis", "分析"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`tab-button${activeTab === value ? " tab-button-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === value}
                  onClick={() => setActiveTab(value as DashboardTab)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "workspace" ? (
            <section className="workspace-grid">
              {allowEditing ? <SetupPanel {...setupPanelProps} /> : null}
              <section className="panel">
                <div className="panel-inner stack">
                  <div>
                    <h2>{allowEditing ? "ワークスペース概要" : "試合概要"}</h2>
                    <p className="muted">
                      {allowEditing
                        ? "現在の試合データ、共有状態、フィルタ条件をここで俯瞰します。"
                        : "現在公開されている試合データと、閲覧中の状態をここで確認します。"}
                    </p>
                  </div>

                  <div className="overview-grid">
                    <div className="meta-card">
                      <span className="muted">現在の試合</span>
                      <strong>
                        {match
                          ? `${match.teams.home.name} vs ${match.teams.away.name}`
                          : "試合未設定"}
                      </strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">ワークスペース</span>
                      <strong>{workspaceName}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">サーバー保存</span>
                      <strong>{remoteSavedAt ? "あり" : "なし"}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">保存先</span>
                      <strong>{storeProvider ?? "不明"}</strong>
                    </div>
                  </div>

                  <Filters
                    teamOptions={filterOptions.teams}
                    playerOptions={filterOptions.players}
                    skillOptions={filterOptions.skills}
                    filters={filters}
                    onChange={handleFiltersChange}
                  />

                  <section className="panel-section soft-panel">
                    <div className="section-heading">
                      <h3>{allowEditing ? "状態メモ" : "閲覧状態"}</h3>
                      <p className="muted">
                        状態表示をひとまとまりにして、現在の同期状態を見やすくしています。
                      </p>
                    </div>
                    <div className="status-list">
                      <div className="status-row">
                        <span>状態</span>
                        <strong>{status}</strong>
                      </div>
                      <div className="status-row">
                        <span>共有URL</span>
                        <strong>{shareStatus ?? "未準備"}</strong>
                      </div>
                      <div className="status-row">
                        <span>前回ローカル保存</span>
                        <strong>{lastSavedAt ?? "未保存"}</strong>
                      </div>
                      <div className="status-row">
                        <span>プレーヤー時刻</span>
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
            </section>
          ) : null}

          {activeTab === "video" ? (
            <section className="dashboard-content-stack">
              <VideoPlayer
                match={filteredMatch}
                settings={settings}
                selectedPlay={selectedPlay}
                onPlayerTimeChange={setCurrentPlayerSeconds}
              />
              <section className="panel">
                <div className="panel-inner stack">
                  <div>
                    <h2>同期情報</h2>
                    <p className="muted">
                      動画とプレイの同期調整に必要な項目だけをまとめています。
                    </p>
                  </div>
                  <div className="overview-grid">
                    <div className="meta-card">
                      <span className="muted">オフセット</span>
                      <strong>{settings.offsetSeconds}s</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">プリロール</span>
                      <strong>{settings.prerollSeconds}s</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">時刻基準</span>
                      <strong>{settings.useOriginalTime ? "元時刻" : "再生時刻"}</strong>
                    </div>
                    <div className="meta-card">
                      <span className="muted">選択中プレイ</span>
                      <strong>{selectedPlay?.skill ?? "なし"}</strong>
                    </div>
                  </div>
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "plays" ? (
            <section className="workspace-grid">
              <Filters
                teamOptions={filterOptions.teams}
                playerOptions={filterOptions.players}
                skillOptions={filterOptions.skills}
                filters={filters}
                onChange={handleFiltersChange}
              />
              <PlayList
                match={filteredMatch}
                settings={settings}
                selectedPlayId={selectedPlay?.id}
                onSelectPlay={setSelectedPlay}
              />
            </section>
          ) : null}

          {activeTab === "analysis" ? (
            <section className="dashboard-content-stack">
              <div className="detail-grid">
                <AnalysisPanel match={filteredMatch} />
                <RotationPanel
                  match={filteredMatch}
                  selectedPlayId={selectedPlay?.id}
                />
              </div>
            </section>
          ) : null}
        </section>
      ) : (
        <section className="home-grid home-grid-polished">
          <section className="panel home-landing-panel">
            <div className="panel-inner stack">
              <div className="home-intro">
                <div
                  className="logo-placeholder logo-placeholder-large"
                  aria-label="東大バレー部ロゴ"
                >
                  <img className="logo-image logo-image-large" src="/logo.png" alt="東大バレー部ロゴ" />
                </div>
                <div>
                  <div className="hero-kicker">
                    東京大学運動会バレー部
                  </div>
                  <h2>試合レビューの入口を、ひとつに。</h2>
                  <p className="muted">
                    {landingMessage ??
                      "公開中の試合ワークスペースを確認し、プレイと映像を行き来しながらレビューできる、東京大学運動会バレー部専用の環境です。"}
                  </p>
                </div>
              </div>

              <div className="home-steps">
                <article className="home-step">
                  <span className="home-step-index">01</span>
                  <div>
                    <strong>試合ワークスペースを開く</strong>
                    <p className="muted">
                      スタッフが設定した現在の試合ワークスペースを開いて、すぐにレビューへ入れます。
                    </p>
                  </div>
                </article>
                <article className="home-step">
                  <span className="home-step-index">02</span>
                  <div>
                    <strong>映像で確認する</strong>
                    <p className="muted">
                      プレイ一覧から試合映像へ移動し、分析対象のラリーを短時間で確認できます。
                    </p>
                  </div>
                </article>
                <article className="home-step">
                  <span className="home-step-index">03</span>
                  <div>
                    <strong>動画ライブラリを見る</strong>
                    <p className="muted">
                      試合外の参考動画は専用ライブラリに蓄積し、テーマごとに参照できます。
                    </p>
                  </div>
                </article>
              </div>

              <div className="home-feature-band">
                <div className="feature-chip">試合レビュー</div>
                <div className="feature-chip">映像ジャンプ</div>
                <div className="feature-chip">ローテーション確認</div>
                <div className="feature-chip">共有ワークスペース</div>
              </div>
            </div>
          </section>

          <div className="stack">
            {allowEditing ? <SetupPanel {...setupPanelProps} /> : null}
            <section className="panel">
              <div className="panel-inner stack">
                <div>
                  <h2>{allowEditing ? "部内向け概要" : "現在の閲覧情報"}</h2>
                  <p className="muted">
                    {allowEditing
                      ? "初期状態で必要な情報だけを右側に残し、最初の一歩を迷わないようにしています。"
                      : "一般部員向けには閲覧に必要な要素だけを残し、設定操作を分離しています。"}
                  </p>
                </div>

                <div className="overview-grid">
                  <div className="meta-card">
                    <span className="muted">Saved Workspaces</span>
                    <strong>{savedWorkspaces.length}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="muted">保存先</span>
                    <strong>{storeProvider ?? "ローカル"}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="muted">Status</span>
                    <strong>{status}</strong>
                  </div>
                  <div className="meta-card">
                    <span className="muted">Workspace</span>
                    <strong>{workspaceName}</strong>
                  </div>
                </div>

                {error ? <p className="error-text">{error}</p> : null}
              </div>
            </section>
          </div>
        </section>
      )}
    </main>
  );
}
