import { readScoutRosterFile, toRosterView, type ScoutRosterView } from "@/lib/domain/input-assist/roster";
import type { IaPlayer } from "@/lib/domain/input-assist/types";
import type { ScoutFileNode } from "@/lib/domain/types";
import { getScoutFileLibrary, getScoutFileRecord } from "@/lib/server/app-settings-store";
import { listMembers } from "@/lib/server/portal-member-store";

// 打ち込み補助の名簿を、データライブラリ(vsdb・vsm)と部内ポータルの名簿から取る。

export type RosterFileChoice = {
  fileId: string;
  name: string;
  /** フォルダの並び(「2027上半期 / 秋季リーグ」)。一番上なら空。 */
  folder: string;
  extension: ".vsm" | ".vsdb";
};

/** データライブラリの vsdb・vsm(フォルダの中も)。vsdb を先に、名前の順。 */
export async function listRosterFiles(teamSlug: string): Promise<RosterFileChoice[]> {
  const library = await getScoutFileLibrary(teamSlug);
  const output: RosterFileChoice[] = [];
  const walk = (nodes: ScoutFileNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.type === "folder") {
        walk(node.children ?? [], [...path, node.name]);
      } else if (node.fileId && (node.extension === ".vsdb" || node.extension === ".vsm")) {
        output.push({ fileId: node.fileId, name: node.name, folder: path.join(" / "), extension: node.extension });
      }
    }
  };
  walk(library.root, []);
  return output.sort(
    (left, right) =>
      Number(right.extension === ".vsdb") - Number(left.extension === ".vsdb") || left.name.localeCompare(right.name, "ja"),
  );
}

/**
 * データライブラリの試合データ(vsdb・vsm)を読んで、名簿にする。ライブラリにない・読めないなら null。
 * ライブラリの中にあるもの(そのチームのもの)だけを読む。
 */
export async function readRosterFromLibrary(teamSlug: string, fileId: string): Promise<ScoutRosterView | null> {
  const choices = await listRosterFiles(teamSlug);
  if (!choices.some((choice) => choice.fileId === fileId)) {
    return null;
  }
  const record = await getScoutFileRecord(fileId, teamSlug);
  if (!record || typeof record.text !== "string") {
    return null;
  }
  return toRosterView(readScoutRosterFile(record.text, record.fileName));
}

/** 部内ポータルの名簿の選手(背番号が数字の人だけ。背番号の順)。 */
export async function listPortalPlayers(teamSlug: string): Promise<IaPlayer[]> {
  const members = await listMembers(teamSlug);
  return members
    .filter((member) => member.role !== "staff" && member.number !== null && /^\d{1,2}$/.test(member.number.trim()))
    .map((member) => {
      const player: IaPlayer = { shirtNumber: Number(member.number?.trim()), lastName: member.name };
      if (member.givenName) {
        player.firstName = member.givenName;
      }
      return player;
    })
    .sort((left, right) => left.shirtNumber - right.shirtNumber);
}
