import { describe, expect, it } from "vitest";
import { COURT_LEFT, COURT_RIGHT, HALF_COURT_HEIGHT, NET_Y, getEndZonePoint, getEndZoneRect } from "@/lib/domain/court";
import { zoneCenter } from "@/lib/domain/input-assist/zone";

// 相手のコート(図の上)は、相手から見た向きを上下・左右とも逆にして描く(2026-11-22 に左右を直した)。
describe("相手のコートのゾーンの向き", () => {
  const mid = (COURT_LEFT + COURT_RIGHT) / 2;

  it("ゾーン4(相手のレフト)はネット際の図の右、ゾーン2 は左、ゾーン1 は奥の左", () => {
    const four = getEndZonePoint(4)!;
    const two = getEndZonePoint(2)!;
    const one = getEndZonePoint(1)!;
    const five = getEndZonePoint(5)!;
    expect(four.x).toBeGreaterThan(mid);
    expect(two.x).toBeLessThan(mid);
    expect(four.y).toBeGreaterThan(one.y); // 4 はネット側(図の下寄り)
    expect(one.x).toBeLessThan(mid);
    expect(five.x).toBeGreaterThan(mid);
  });

  it("サブゾーンまで、打ち込み補助の置き方を上下・左右逆にしたものと同じ", () => {
    for (const zone of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      for (const sub of [undefined, "A", "B", "C", "D"]) {
        const own = zoneCenter(zone, sub)!;
        expect(getEndZonePoint(zone, sub)).toEqual({
          x: COURT_RIGHT - (COURT_RIGHT - COURT_LEFT) * own.x,
          y: NET_Y - HALF_COURT_HEIGHT * own.y,
        });
      }
    }
  });

  it("ヒートマップの四角は、落ちた場所の点を含む", () => {
    for (const zone of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const rect = getEndZoneRect(zone)!;
      const point = getEndZonePoint(zone)!;
      expect(point.x).toBeGreaterThan(rect.x);
      expect(point.x).toBeLessThan(rect.x + rect.width);
      expect(point.y).toBeGreaterThan(rect.y);
      expect(point.y).toBeLessThan(rect.y + rect.height);
    }
  });
});
