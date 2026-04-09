import type { LocationData, LocationGroup, MarkerColor, ViewMode } from "./types";
import { getColorByMode } from "./colorByMode";

// 색상 우선순위 (낮은 값일수록 위험 → 우선 표시)
const COLOR_PRIORITY: Record<MarkerColor, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  blue: 3,
};

/**
 * 같은 좌표끼리 모아 LocationGroup 배열로 변환
 * 각 그룹의 대표 색상은 가장 위험한 색상으로 결정
 */
export function groupByLocation(
  items: LocationData[],
  mode: ViewMode = "combined"
): LocationGroup[] {
  const map = new Map<string, LocationGroup>();

  for (const item of items) {
    if (item.lat === undefined || item.lng === undefined) continue;

    const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
    let group = map.get(key);

    const itemColor = getColorByMode(item, mode);

    if (!group) {
      group = {
        lat: item.lat,
        lng: item.lng,
        items: [],
        color: itemColor,
      };
      map.set(key, group);
    }

    group.items.push(item);
    // 더 위험한 색상이면 그룹 색상 업데이트
    if (COLOR_PRIORITY[itemColor] < COLOR_PRIORITY[group.color]) {
      group.color = itemColor;
    }
  }

  return Array.from(map.values());
}
