import type { ParsedPlay } from "@/lib/domain/types";

// コートの図の座標(試合ビューアの「コース」と、マイプレーのコートの図で共通。2026-10-24 に course-panel.tsx から移した)。
// 図の大きさは 500 × 780(viewBox)。上が相手のコート、下が自チームのコート。

export type Point = {
  x: number;
  y: number;
};

export const COURT_LEFT = 70;
export const COURT_RIGHT = 430;
export const COURT_TOP = 30;
export const COURT_BOTTOM = 750;
export const NET_Y = 390;
export const HALF_COURT_HEIGHT = 360;

const ZONE_GRID: Record<number, { column: number; row: number }> = {
  4: { column: 0, row: 0 },
  3: { column: 1, row: 0 },
  2: { column: 2, row: 0 },
  7: { column: 0, row: 1 },
  8: { column: 1, row: 1 },
  9: { column: 2, row: 1 },
  5: { column: 0, row: 2 },
  6: { column: 1, row: 2 },
  1: { column: 2, row: 2 },
};

const SERVE_START_ZONES = [5, 7, 6, 9, 1];

export function getZonePoint(zone: number, courtSide: "near" | "far"): Point | undefined {
  const grid = ZONE_GRID[zone];
  if (!grid) {
    return undefined;
  }

  const cellWidth = (COURT_RIGHT - COURT_LEFT) / 3;
  const cellHeight = HALF_COURT_HEIGHT / 3;
  const localX = COURT_LEFT + cellWidth * (grid.column + 0.5);
  const localY = cellHeight * (grid.row + 0.5);

  if (courtSide === "near") {
    return {
      x: localX,
      y: NET_Y + localY,
    };
  }

  return {
    x: COURT_LEFT + COURT_RIGHT - localX,
    y: NET_Y - localY,
  };
}

// サブゾーン:そのコートのチームから見て(ネットが上)、[ネット側, エンドライン側] × [左, 右]。
// 打ち込み補助(lib/domain/input-assist/zone.ts の SUB_ZONE_GRID)と同じ。
const SUB_ZONE_GRID: string[][] = [
  ["C", "B"],
  ["D", "A"],
];

/**
 * 相手のコート(図の上)の、ボールが落ちた場所。
 * ゾーンは「そのコートのチームから見た向き」なので、相手のコートは図では上下も左右も逆になる
 * (相手から見た左 = 図の右。ゾーン4 は図の右上ではなくネット際の右、ゾーン1 は奥の左)。
 * 2026-11-22 まで左右を逆にしておらず、4 と 2、5 と 1、7 と 9 が入れ替わって描かれていた。
 */
export function getEndZonePoint(zone: number, subZone?: string): Point | undefined {
  const grid = ZONE_GRID[zone];
  if (!grid) {
    return undefined;
  }

  // そのコートのチームから見た位置(x:左 0 → 右 1、y:ネット 0 → エンドライン 1)。
  let dx = 0.5;
  let dy = 0.5;
  const normalizedSubZone = subZone?.trim().toUpperCase();
  const subRow = SUB_ZONE_GRID.findIndex((letters) => letters.includes(normalizedSubZone ?? ""));
  if (normalizedSubZone && subRow !== -1) {
    dx = SUB_ZONE_GRID[subRow].indexOf(normalizedSubZone) === 0 ? 0.25 : 0.75;
    dy = subRow === 0 ? 0.25 : 0.75;
  }
  const x = (grid.column + dx) / 3;
  const y = (grid.row + dy) / 3;

  return {
    x: COURT_RIGHT - (COURT_RIGHT - COURT_LEFT) * x,
    y: NET_Y - HALF_COURT_HEIGHT * y,
  };
}

export function getServeStartPoint(zone: number): Point | undefined {
  const positionIndex = SERVE_START_ZONES.indexOf(zone);
  if (positionIndex === -1) {
    return undefined;
  }

  const courtWidth = COURT_RIGHT - COURT_LEFT;
  return {
    x: COURT_LEFT + courtWidth * ((positionIndex + 0.5) / SERVE_START_ZONES.length),
    y: COURT_BOTTOM,
  };
}

export function getAttackStartPoint(play: ParsedPlay): Point | undefined {
  const hitType = play.hitType?.trim().toUpperCase();
  const courtWidth = COURT_RIGHT - COURT_LEFT;

  if (
    play.startZone === 7 ||
    play.startZone === 8 ||
    play.startZone === 9
  ) {
    const column = play.startZone - 7;
    return {
      x: COURT_LEFT + courtWidth * ((column + 0.5) / 3),
      y: NET_Y + 120,
    };
  }

  if (hitType === "P1" || hitType === "PV") {
    return {
      x: COURT_LEFT + courtWidth / 18,
      y: NET_Y,
    };
  }

  if (hitType === "P5" || hitType === "PZ") {
    return {
      x: COURT_RIGHT - courtWidth / 18,
      y: NET_Y,
    };
  }

  if (typeof play.startZone !== "number") {
    return {
      x: COURT_LEFT + courtWidth / 2,
      y: NET_Y,
    };
  }

  const zonePoint = getZonePoint(play.startZone, "near");
  return zonePoint
    ? {
        x: zonePoint.x,
        y: NET_Y,
      }
    : {
        x: COURT_LEFT + courtWidth / 2,
        y: NET_Y,
      };
}

export type CourseLine = {
  start: Point;
  end: Point;
  // kill:決まった(アタックの # / サーブのエース)、error:ミス(= と被ブロック /)、other:それ以外
  result: "kill" | "error" | "other";
};

/** サーブ・アタック1本の軌道(試合ビューアの「コース」と同じ置き方)。ゾーンがなければ undefined。 */
export function getCourseLine(play: ParsedPlay): CourseLine | undefined {
  if (typeof play.endZone !== "number") {
    return undefined;
  }
  const start =
    play.skill === "S"
      ? typeof play.startZone === "number"
        ? getServeStartPoint(play.startZone)
        : undefined
      : play.skill === "A"
        ? getAttackStartPoint(play)
        : undefined;
  const end = getEndZonePoint(play.endZone, play.endSubZone);
  if (!start || !end) {
    return undefined;
  }
  const kill = play.effect === "#" || (play.skill === "S" && play.effect === "+");
  const error = play.effect === "=" || play.effect === "/";
  return { start, end, result: kill ? "kill" : error ? "error" : "other" };
}

/** 相手のコートの、そのゾーンの四角(落ちた場所のヒートマップに使う。getEndZonePoint と同じ置き方)。 */
export function getEndZoneRect(zone: number): { x: number; y: number; width: number; height: number } | undefined {
  const grid = ZONE_GRID[zone];
  if (!grid) {
    return undefined;
  }
  const width = (COURT_RIGHT - COURT_LEFT) / 3;
  const height = HALF_COURT_HEIGHT / 3;
  // 相手のコートなので左右を逆に(相手から見た左の列が、図の右)。
  return { x: COURT_LEFT + width * (2 - grid.column), y: NET_Y - height * (grid.row + 1), width, height };
}

export const END_ZONES = [4, 3, 2, 7, 8, 9, 5, 6, 1];

export type ZoneCount = { zone: number; count: number; kills: number };

/** 落ちた場所(ゾーン)ごとの本数と、決まった数。ゾーンのないプレーは数えない。 */
export function countEndZones(plays: ParsedPlay[]): ZoneCount[] {
  return END_ZONES.map((zone) => {
    const inZone = plays.filter((play) => play.endZone === zone);
    return {
      zone,
      count: inZone.length,
      kills: inZone.filter((play) => play.effect === "#" || (play.skill === "S" && play.effect === "+")).length,
    };
  });
}
