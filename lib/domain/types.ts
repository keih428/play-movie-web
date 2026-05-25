export type TeamSide = "home" | "away";

export type MatchTeam = {
  code?: string;
  shortCode?: string;
  name: string;
};

export type MatchLineup = {
  setterAt?: number;
  positions: Record<string, number | string | undefined>;
};

export type ParsedPlay = {
  id: string;
  team: string;
  player?: string;
  skill?: string;
  hitType?: string;
  effect?: string;
  code?: string;
  time?: number;
  originalTime?: number;
  startZone?: number;
  endZone?: number;
  endSubZone?: string;
};

export type ParsedEvent = {
  id: string;
  eventIndex: number;
  score: {
    home: number;
    away: number;
  };
  point?: string;
  plays: ParsedPlay[];
  lineup: Record<TeamSide, MatchLineup>;
};

export type ParsedSet = {
  id: string;
  setIndex: number;
  score: {
    home: number;
    away: number;
  };
  events: ParsedEvent[];
};

export type ParsedMatch = {
  id: string;
  sourceType: "vsm" | "vsdb";
  fileName: string;
  startDate?: string;
  createdAt?: string;
  gameType?: string;
  version?: number;
  teams: {
    home: MatchTeam;
    away: MatchTeam;
  };
  video?: {
    path?: string;
  };
  sets: ParsedSet[];
};

export type ParsedCollection = {
  sourceType: "vsm" | "vsdb";
  season?: {
    name?: string;
    startDate?: string;
    endDate?: string;
  };
  teams?: MatchTeam[];
  matches: ParsedMatch[];
};

export type VideoSyncSettings = {
  youtubeUrl: string;
  offsetSeconds: number;
  prerollSeconds: number;
  useOriginalTime: boolean;
};

export type PersistedWorkspace = {
  collection: ParsedCollection;
  settings: VideoSyncSettings;
  selectedMatchIndex: number;
  savedAt: string;
};

export type SavedWorkspaceRecord = PersistedWorkspace & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedWorkspaceSummary = {
  id: string;
  name: string;
  sourceType: ParsedCollection["sourceType"];
  matchCount: number;
  updatedAt: string;
};

export type WorkspaceStoreProvider = "local" | "vercel-blob";

export type StaffAppSettings = {
  defaultWorkspaceId?: string;
  defaultWorkspaceName?: string;
  landingMessage?: string;
  updatedAt: string;
};

export type VideoLibraryNode = {
  id: string;
  type: "folder" | "link";
  name: string;
  children?: VideoLibraryNode[];
  url?: string;
  note?: string;
};

export type VideoLibrary = {
  root: VideoLibraryNode[];
  updatedAt: string;
};
