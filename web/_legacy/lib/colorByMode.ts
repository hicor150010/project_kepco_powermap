import type { LocationData, MarkerColor, ViewMode } from "./types";

/** 보기 모드에 따라 마커 색상 결정 */
export function getColorByMode(item: LocationData, mode: ViewMode): MarkerColor {
  if (mode === "combined") return item.color;

  const status =
    mode === "subst"
      ? item.vol_subst
      : mode === "mtr"
        ? item.vol_mtr
        : item.vol_dl;

  return status === "여유용량 있음" ? "blue" : "red";
}

/** 보기 모드에서 사용되는 색상 키 목록 */
export function getColorsForMode(mode: ViewMode): MarkerColor[] {
  if (mode === "combined") return ["red", "yellow", "green", "blue"];
  return ["blue", "red"];
}

/** 보기 모드별 색상 라벨 */
export function getColorLabel(color: MarkerColor, mode: ViewMode): string {
  if (mode === "combined") {
    return {
      red: "변전소 여유 없음",
      yellow: "주변압기·배전선로 부족",
      green: "배전선로만 부족",
      blue: "여유 충분",
    }[color];
  }

  const target =
    mode === "subst" ? "변전소" : mode === "mtr" ? "주변압기" : "배전선로";
  return color === "blue" ? `${target} 여유 있음` : `${target} 여유 없음`;
}
