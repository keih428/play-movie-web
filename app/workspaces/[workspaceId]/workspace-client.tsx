"use client";

import { startTransition, useEffect, useState } from "react";
import { AnalysisPanel } from "@/components/analysis-panel";
import { Filters } from "@/components/filters";
import { PlayList } from "@/components/play-list";
import { RotationPanel } from "@/components/rotation-panel";
import { SetupPanel } from "@/components/setup-panel";
import { TabErrorBoundary } from "@/components/tab-error-boundary";
import { VideoPlayer } from "@/components/video-player";
import { getSkillLabel, getTeamLabel } from "@/lib/domain/display";
import { getRotationLabel } from "@/lib/domain/rotation";
import { getMatchResultLabel, getMatchSetScore } from "@/lib/domain/summary";
import {
  buildWorkspacePath,
  getTeamOptionsForMatch,
} from "@/lib/domain/team";
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
  rotation: string;
};

type DashboardTab = "workspace" | "review" | "analysis";

type WorkspaceClientProps = {
  allowEditing?: boolean;
  initialCollection: ParsedCollection;
  initialSettings: VideoSyncSettings;
  initialSelectedMatchIndex?: number;
  initialWorkspaceId?: string;
  initialWorkspaceName?: string;
  initialRemoteSavedAt?: string;
  initialTeamName?: string;
  initialTeamSlug?: string;
  initialStatus?: string;
  skipLocalRestore?: boolean;
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
  const rotations = new Set<string>();

  match?.sets.forEach((set) => {
    set.events.forEach((event) => {
      rotations.add(getRotationLabel(event.lineup.home));
      event.plays.forEach((play) => {
        if (play.team) {
          teams.add(getTeamLabel(play.team, match));
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
    rotations: [...rotations].filter((value) => value !== "-").sort(),
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
              if (
                filters.rotation !== "all" &&
                getRotationLabel(event.lineup.home) !== filters.rotation
              ) {
                return false;
              }
              if (
                filters.team !== "all" &&
                getTeamLabel(play.team, match) !== filters.team
              ) {
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

export function WorkspaceClient({
  allowEditing = false,
  initialCollection,
  initialSettings,
  initialSelectedMatchIndex = 0,
  initialWorkspaceId,
  initialWorkspaceName,
  initialRemoteSavedAt,
  initialTeamName,
  initialTeamSlug,
  initialStatus,
  skipLocalRestore,
}: WorkspaceClientProps) {
  const [collection, setCollection] = useState(initialCollection);
  const [settings, setSettings] = useState(initialSettings);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(initialSelectedMatchIndex);
  const [filters, setFilters] = useState<FilterState>({
    team: "all",
    player: "all",
    skill: "all",
    rotation: "all",
  });
  const [status, setStatus] = useState(initialStatus ?? "試合データの準備ができています");
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedPlay, setSelectedPlay] = useState<ParsedPlay | undefined>();
  const [currentPlayerSeconds, setCurrentPlayerSeconds] = useState<number>();
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [hasHydratedWorkspace, setHasHydratedWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(
    initialWorkspaceName ?? "試合ワークスペース",
  );
  const [teamName, setTeamName] = useState<string | undefined>(initialTeamName);
  const [teamSlug, setTeamSlug] = useState<string>(initialTeamSlug ?? "");
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
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    !allowEditing && initialWorkspaceId ? "review" : "workspace",
  );
  const [selectedScoutFileId, setSelectedScoutFileId] = useState<string>();

  const match = collection.matches[selectedMatchIndex];
  const filteredMatch = getFilteredMatch(match, filters);
  const playCount = countPlays(filteredMatch);
  const filterOptions = getFilterOptions(match);
  const teamOptions = getTeamOptionsForMatch(match);
  const shareUrl =
    typeof window !== "undefined" && remoteWorkspaceId
      ? (() => {
          const url = new URL(window.location.href);
          url.pathname = buildWorkspacePath({
            teamSlug: teamSlug || undefined,
            workspaceId: remoteWorkspaceId,
          });
          url.search = "";
          return url.toString();
        })()
      : undefined;

  useEffect(() => {
    if (collection.matches.length === 0) {
      if (selectedMatchIndex !== 0) {
        setSelectedMatchIndex(0);
      }
      return;
    }

    if (selectedMatchIndex < 0 || selectedMatchIndex >= collection.matches.length) {
      setSelectedMatchIndex(
        Math.max(0, Math.min(selectedMatchIndex, collection.matches.length - 1)),
      );
    }
  }, [collection.matches.length, selectedMatchIndex]);

  useEffect(() => {
    if (teamOptions.length === 0) {
      if (teamSlug) {
        setTeamSlug("");
        setTeamName(undefined);
      }
      return;
    }

    const matchedOption = teamOptions.find((option) => option.slug === teamSlug);
    if (matchedOption) {
      if (teamName !== matchedOption.name) {
        setTeamName(matchedOption.name);
      }
      return;
    }

    setTeamSlug(teamOptions[0].slug);
    setTeamName(teamOptions[0].name);
  }, [teamOptions, teamSlug, teamName]);

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
        setTeamSlug(persisted.teamSlug ?? "");
        setTeamName(persisted.teamName);
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
      teamName,
      teamSlug: teamSlug || undefined,
      savedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(persisted));
      window.setTimeout(() => {
        setLastSavedAt(persisted.savedAt);
      }, 0);
    } catch {
      window.setTimeout(() => {
        setError("failed to save workspace to localStorage");
      }, 0);
    }
  }, [collection, settings, selectedMatchIndex, teamName, teamSlug, hasHydratedWorkspace]);

  async function handleLoadScoutFile(fileId: string) {
    setError(null);
    setStatus("試合データを反映しています...");
    setIsParsing(true);

    try {
      const response = await fetch(`/api/scout-files/${fileId}`);
      const payload = (await response.json()) as {
        record?: {
          id: string;
          fileName: string;
          parsedCollection: ParsedCollection;
        };
        error?: string;
      };

      if (!response.ok || !payload.record) {
        throw new Error(payload.error || "load failed");
      }

      const record = payload.record;

      startTransition(() => {
        setCollection(record.parsedCollection);
        setSelectedMatchIndex(0);
        setSelectedPlay(undefined);
        setWorkspaceName(record.fileName.replace(/\.[^.]+$/, ""));
        setActiveTab("review");
        setFilters({
          team: "all",
          player: "all",
          skill: "all",
          rotation: "all",
        });
      });
      setStatus(`試合データを反映しました: ${record.fileName}`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "load failed");
      setStatus("試合データの反映に失敗しました");
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
      rotation: "all",
    });
  }

  function handleTeamChange(nextTeamSlug: string) {
    setTeamSlug(nextTeamSlug);
    const nextTeam = teamOptions.find((option) => option.slug === nextTeamSlug);
    setTeamName(nextTeam?.name);
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
        rotation: "all",
      });
      setSelectedPlay(undefined);
      setLastSavedAt(undefined);
      setRemoteWorkspaceId(undefined);
      setRemoteSavedAt(undefined);
      setTeamSlug(initialTeamSlug ?? "");
      setTeamName(initialTeamName);
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
      teamName,
      teamSlug: teamSlug || undefined,
      savedAt: new Date().toISOString(),
    };
  }

  async function handleSaveWorkspace() {
    if (!teamSlug) {
      setError("公開チームを選択してください");
      setStatus("公開チームの選択が必要です");
      return;
    }

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
      setTeamName(payload.workspace.teamName);
      setTeamSlug(payload.workspace.teamSlug ?? "");
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
          rotation: "all",
        });
        setWorkspaceName(workspace.name);
        setTeamName(workspace.teamName);
        setTeamSlug(workspace.teamSlug ?? "");
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
      setError(deleteError instanceof Error ? deleteError.message : "delete failed");
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
    teamOptions: teamOptions.map((option) => ({
      label: option.name,
      value: option.slug,
    })),
    selectedTeamSlug: teamSlug,
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
    onScoutFileChange: setSelectedScoutFileId,
    onLoadScoutFile: handleLoadScoutFile,
    onMatchChange: handleMatchChange,
    onTeamChange: handleTeamChange,
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

  const hasMatches = collection.matches.length > 0;

  return (
    <main className="page-shell">
      {hasMatches ? (
        <section className="hero hero-home">
          <div className="hero-grid">
            <div>
              <div className="hero-kicker">{teamName ?? "チーム共有ビュー"}</div>
              <h1>{teamName ? `${teamName} 試合ビューア` : "試合ビューア"}</h1>
              <p>
                試合データを整理し、動画同期、プレイ確認、ローテーション分析までを
                ひとつのワークスペースで扱うための共有ビューです。
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
                <strong>{countPlays(filteredMatch)}</strong>
              </div>
              <div className="meta-card">
                <span className="muted">表示モード</span>
                <strong>{collection.sourceType.toUpperCase()}</strong>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {hasMatches ? (
        <section className="dashboard-shell">
          <div className="dashboard-header">
            <div className="tab-row" role="tablist" aria-label="画面切替">
              {[
                ["workspace", "概要"],
                ["review", "レビュー"],
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
            <TabErrorBoundary tabLabel="概要">
              <section
                className={`workspace-grid${allowEditing ? "" : " workspace-grid-wide"}`}
              >
                {allowEditing ? <SetupPanel {...setupPanelProps} /> : null}
                <section className="panel">
                  <div className="panel-inner stack">
                    <div>
                      <h2>{allowEditing ? "ワークスペース概要" : "試合概要"}</h2>
                      <p className="muted">
                        {allowEditing
                          ? "現在の試合データとワークスペース名だけを簡潔に確認します。"
                          : "現在公開されている試合データの概要だけを確認します。"}
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
                        <span className="muted">セット数</span>
                        <strong>{match?.sets.length ?? 0}</strong>
                      </div>
                      <div className="meta-card">
                        <span className="muted">プレイ数</span>
                        <strong>{countPlays(match)}</strong>
                      </div>
                    </div>

                    {match ? (
                      <section className="panel-section soft-panel">
                        <div className="section-heading">
                          <h3>試合結果</h3>
                          <p className="muted">
                            セットスコアと各セットの勝敗をまとめて確認できます。
                          </p>
                        </div>
                        <div className="overview-grid">
                          <div className="meta-card">
                            <span className="muted">試合結果</span>
                            <strong>{getMatchResultLabel(match)}</strong>
                          </div>
                          <div className="meta-card">
                            <span className="muted">セットスコア</span>
                            <strong>
                              {getMatchSetScore(match).home}-{getMatchSetScore(match).away}
                            </strong>
                          </div>
                        </div>
                        <div className="score-table-wrap">
                          <table className="score-table">
                            <thead>
                              <tr>
                                <th>セット</th>
                                <th>ホーム</th>
                                <th>アウェイ</th>
                                <th>勝敗</th>
                                <th>ラリー</th>
                                <th>プレイ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {match.sets.map((set) => {
                                const winner =
                                  set.score.home === set.score.away
                                    ? "引き分け"
                                    : set.score.home > set.score.away
                                      ? `${match.teams.home.name} セット先取`
                                      : `${match.teams.away.name} セット先取`;
                                const setPlayCount = set.events.reduce(
                                  (sum, event) => sum + event.plays.length,
                                  0,
                                );

                                return (
                                  <tr key={set.id}>
                                    <td>セット {set.setIndex}</td>
                                    <td>{set.score.home}</td>
                                    <td>{set.score.away}</td>
                                    <td>{winner}</td>
                                    <td>{set.events.length}</td>
                                    <td>{setPlayCount}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ) : null}
                  </div>
                </section>
              </section>
            </TabErrorBoundary>
          ) : null}

          {activeTab === "review" ? (
            <TabErrorBoundary tabLabel="レビュー">
              <section className="dashboard-content-stack">
                <Filters
                  teamOptions={filterOptions.teams}
                  playerOptions={filterOptions.players}
                  skillOptions={filterOptions.skills}
                  rotationOptions={filterOptions.rotations}
                  filters={filters}
                  onChange={handleFiltersChange}
                />

                <div className="review-layout">
                  <div className="review-primary">
                    <VideoPlayer
                      match={filteredMatch}
                      settings={settings}
                      selectedPlay={selectedPlay}
                      onPlayerTimeChange={setCurrentPlayerSeconds}
                    />
                  </div>

                  <PlayList
                    match={filteredMatch}
                    settings={settings}
                    selectedPlayId={selectedPlay?.id}
                    onSelectPlay={setSelectedPlay}
                  />
                </div>
              </section>
            </TabErrorBoundary>
          ) : null}

          {activeTab === "analysis" ? (
            <TabErrorBoundary tabLabel="分析">
              <section className="dashboard-content-stack">
                <div className="detail-grid">
                  <AnalysisPanel match={filteredMatch} />
                  <RotationPanel
                    match={filteredMatch}
                    selectedPlayId={selectedPlay?.id}
                  />
                </div>
              </section>
            </TabErrorBoundary>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
