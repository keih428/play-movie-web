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

type HomeClientProps = {
  initialCollection: ParsedCollection;
  initialSettings: VideoSyncSettings;
  initialWorkspaceId?: string;
  initialWorkspaceName?: string;
  initialRemoteSavedAt?: string;
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
  initialCollection,
  initialSettings,
  initialWorkspaceId,
  initialWorkspaceName,
  initialRemoteSavedAt,
  initialStatus,
  skipLocalRestore,
}: HomeClientProps) {
  const [collection, setCollection] = useState(initialCollection);
  const [settings, setSettings] = useState(initialSettings);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    team: "all",
    player: "all",
    skill: "all",
  });
  const [status, setStatus] = useState(initialStatus ?? "Sample data loaded");
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedPlay, setSelectedPlay] = useState<ParsedPlay | undefined>();
  const [currentPlayerSeconds, setCurrentPlayerSeconds] = useState<number>();
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [hasHydratedWorkspace, setHasHydratedWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(
    initialWorkspaceName ?? "UTVB Workspace",
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

      startTransition(() => {
        setCollection(payload.workspace!.collection);
        setSettings(payload.workspace!.settings);
        setSelectedMatchIndex(payload.workspace!.selectedMatchIndex);
        setSelectedPlay(undefined);
        setFilters({
          team: "all",
          player: "all",
          skill: "all",
        });
        setWorkspaceName(payload.workspace!.name);
        setRemoteSavedAt(payload.workspace!.updatedAt);
        setLastSavedAt(payload.workspace!.savedAt);
        setShareStatus("ready to copy");
        setStoreProvider(payload.provider);
      });
      setStatus(`Loaded workspace ${payload.workspace.name}`);
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

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>Scout the rally, then jump to the tape.</h1>
            <p>
              VolleyStation 由来の `.vsm` / `.vsdb` データを正規化し、
              YouTube 動画と同期して、プレイ一覧・スコア推移・ローテーション分析へつなぐ
              Web アプリの初期雛形です。
            </p>
            <div className="badge-row">
              <span className="badge">MVP ready skeleton</span>
              <span className="badge">Live parse API connected</span>
              <span className="badge">YouTube sync formula</span>
            </div>
          </div>

          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">Matches</span>
              <strong>{collection.matches.length}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Sets</span>
              <strong>{filteredMatch?.sets.length ?? 0}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Filtered Plays</span>
              <strong>{playCount}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Mode</span>
              <strong>{collection.sourceType.toUpperCase()}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="layout-grid">
        <div className="stack">
          <SetupPanel
            settings={settings}
            matchCount={collection.matches.length}
            matchOptions={collection.matches.map((entry, index) => ({
              index,
              label: `${index + 1}. ${entry.teams.home.name} vs ${entry.teams.away.name}`,
            }))}
            selectedMatchIndex={selectedMatchIndex}
            status={status}
            error={error}
            isParsing={isParsing}
            currentPlayerSeconds={currentPlayerSeconds}
            lastSavedAt={lastSavedAt}
            workspaceName={workspaceName}
            remoteWorkspaceId={remoteWorkspaceId}
            remoteSavedAt={remoteSavedAt}
            shareUrl={shareUrl}
            shareStatus={shareStatus}
            storeProvider={storeProvider}
            savedWorkspaces={savedWorkspaces}
            isSyncingWorkspace={isSyncingWorkspace}
            onParseFile={handleParseFile}
            onMatchChange={handleMatchChange}
            onSettingsChange={setSettings}
            onCaptureOffset={handleCaptureOffset}
            onClearSavedWorkspace={handleClearSavedWorkspace}
            onWorkspaceNameChange={setWorkspaceName}
            onRemoteWorkspaceChange={setRemoteWorkspaceId}
            onSaveWorkspace={handleSaveWorkspace}
            onLoadWorkspace={handleLoadWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onRefreshWorkspaces={refreshSavedWorkspaces}
            onCopyShareUrl={handleCopyShareUrl}
          />
          <Filters
            teamOptions={filterOptions.teams}
            playerOptions={filterOptions.players}
            skillOptions={filterOptions.skills}
            filters={filters}
            onChange={handleFiltersChange}
          />
        </div>
        <VideoPlayer
          match={filteredMatch}
          settings={settings}
          selectedPlay={selectedPlay}
          onPlayerTimeChange={setCurrentPlayerSeconds}
        />
        <PlayList
          match={filteredMatch}
          settings={settings}
          selectedPlayId={selectedPlay?.id}
          onSelectPlay={setSelectedPlay}
        />
      </section>

      <section className="analysis-layout">
        <div className="detail-grid">
          <AnalysisPanel match={filteredMatch} />
          <RotationPanel
            match={filteredMatch}
            selectedPlayId={selectedPlay?.id}
          />
        </div>
      </section>
    </main>
  );
}
