import { buildMatchViewerName, buildMatchViewerSettings } from "@/lib/domain/input-assist/match-viewer";
import type { InputAssistMeta } from "@/lib/domain/input-assist/collab";
import { buildVsmBaseName, buildVsmFileName, buildVsmText } from "@/lib/domain/input-assist/vsm-writer";
import { formatTeamSlugLabel } from "@/lib/domain/team";
import type { ScoutFileNode } from "@/lib/domain/types";
import { parseVsmText } from "@/lib/parsers/vsm";
import {
  getScoutFileLibrary,
  saveScoutFileLibrary,
  saveScoutFileRecord,
} from "@/lib/server/app-settings-store";
import { getInputAssistSession, setInputAssistMatchViewer } from "@/lib/server/input-assist-store";
import { getSavedWorkspace, saveWorkspace } from "@/lib/server/workspace-store";

// 「試合ビューアに保存」:打ち込み補助の試合を VSM にして、データライブラリ(フォルダ「打ち込み補助」)に入れ、
// 試合ビューアのワークスペースを作る(2回目からは、同じ試合データとワークスペースを新しくする)。

export const MATCH_VIEWER_FOLDER_NAME = "打ち込み補助";

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function containsFile(nodes: ScoutFileNode[], fileId: string): boolean {
  return nodes.some((node) => node.fileId === fileId || containsFile(node.children ?? [], fileId));
}

function uniqueName(siblings: ScoutFileNode[], base: string): string {
  const taken = new Set(siblings.map((node) => node.name.trim().toLocaleLowerCase()));
  if (!taken.has(base.toLocaleLowerCase())) {
    return base;
  }
  for (let index = 2; ; index += 1) {
    const name = `${base} (${index})`;
    if (!taken.has(name.toLocaleLowerCase())) {
      return name;
    }
  }
}

/** フォルダ「打ち込み補助」(一番上。なければ作る)に、試合データを足した木。 */
export function addToInputAssistFolder(root: ScoutFileNode[], node: ScoutFileNode): ScoutFileNode[] {
  const folder = root.find((entry) => entry.type === "folder" && entry.name === MATCH_VIEWER_FOLDER_NAME);
  if (!folder) {
    return [...root, { id: makeId(), type: "folder", name: MATCH_VIEWER_FOLDER_NAME, children: [node] }];
  }
  const children = folder.children ?? [];
  const named = { ...node, name: uniqueName(children, node.name) };
  return root.map((entry) => (entry === folder ? { ...folder, children: [...children, named] } : entry));
}

export type MatchViewerSaveResult = {
  workspaceId: string;
  scoutFileId: string;
  meta: InputAssistMeta | null;
  created: boolean;
};

export class MatchViewerError extends Error {}

export async function saveInputAssistToMatchViewer(teamSlug: string, sessionId: string): Promise<MatchViewerSaveResult | null> {
  const session = await getInputAssistSession(teamSlug, sessionId);
  if (!session) {
    return null;
  }
  const written = session.sets.filter((set) => !set.skipped);
  if (written.length === 0) {
    throw new MatchViewerError("打つセットがありません。");
  }
  if (!written.some((set) => set.youtubeUrl.trim())) {
    throw new MatchViewerError("セットの YouTube の URL を入れてください。");
  }

  const fileName = buildVsmFileName(session);
  const text = buildVsmText(session);
  const parsedCollection = parseVsmText(text, fileName);
  const match = parsedCollection.matches[0];
  if (!match) {
    throw new MatchViewerError("VSM を作れませんでした。");
  }
  const now = new Date().toISOString();

  // データライブラリ:前に保存した試合データがライブラリに残っていれば、同じものを新しくする
  const library = await getScoutFileLibrary(teamSlug);
  const previousFileId = session.matchViewer?.scoutFileId;
  const reuseFile = Boolean(previousFileId && containsFile(library.root, previousFileId));
  const scoutFileId = reuseFile && previousFileId ? previousFileId : makeId();
  await saveScoutFileRecord(
    { id: scoutFileId, fileName, extension: ".vsm", text, parsedCollection, uploadedAt: now },
    teamSlug,
  );
  if (!reuseFile) {
    await saveScoutFileLibrary(
      {
        root: addToInputAssistFolder(library.root, {
          id: makeId(),
          type: "file",
          name: buildVsmBaseName(session),
          fileId: scoutFileId,
          extension: ".vsm",
          note: `打ち込み補助から(${session.title})`,
        }),
      },
      teamSlug,
    );
  }

  // 試合ビューア:前に作ったワークスペースがあれば、名前と再生の前の秒はそのままで、中身と動画を新しくする
  const previousWorkspace = session.matchViewer?.workspaceId
    ? await getSavedWorkspace(session.matchViewer.workspaceId)
    : null;
  const workspace = await saveWorkspace({
    id: previousWorkspace?.id,
    name: previousWorkspace?.name ?? buildMatchViewerName(session),
    workspace: {
      collection: parsedCollection,
      settings: buildMatchViewerSettings(session.sets, match, previousWorkspace?.settings.prerollSeconds ?? 0),
      selectedMatchIndex: 0,
      teamName: formatTeamSlugLabel(teamSlug),
      teamSlug,
      savedAt: now,
    },
  });

  const meta = await setInputAssistMatchViewer(teamSlug, sessionId, {
    workspaceId: workspace.id,
    scoutFileId,
    savedAt: now,
  });
  return { workspaceId: workspace.id, scoutFileId, meta, created: !previousWorkspace };
}
