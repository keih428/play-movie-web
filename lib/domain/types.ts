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
  setIndex?: number;
  player?: string;
  skill?: string;
  hitType?: string;
  combination?: string;
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

export type VideoSyncSetSource = {
  setIndex: number;
  youtubeUrl: string;
  offsetSeconds: number;
};

export type VideoSyncSettings = {
  youtubeUrl: string;
  offsetSeconds: number;
  prerollSeconds: number;
  setVideos?: VideoSyncSetSource[];
};

export type PersistedWorkspace = {
  collection: ParsedCollection;
  settings: VideoSyncSettings;
  selectedMatchIndex: number;
  teamName?: string;
  teamSlug?: string;
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
  teamName?: string;
  teamSlug?: string;
  createdAt: string;
  updatedAt: string;
  matchLabel?: string;
  matchDate?: string;
  resultLabel?: string;
  setScoreLabel?: string;
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
  createdAt?: string;
  systemKey?: "match-videos";
};

export type VideoLibrary = {
  root: VideoLibraryNode[];
  updatedAt: string;
};

export type ScoutFileNode = {
  id: string;
  type: "folder" | "file";
  name: string;
  children?: ScoutFileNode[];
  fileId?: string;
  extension?: ".vsm" | ".vsdb";
  note?: string;
};

export type ScoutFileLibrary = {
  root: ScoutFileNode[];
  updatedAt: string;
};

export type ScoutFileRecord = {
  id: string;
  fileName: string;
  extension: ".vsm" | ".vsdb";
  text: string;
  parsedCollection: ParsedCollection;
  uploadedAt: string;
};
