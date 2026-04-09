/**
 * 마커 색상 결정 로직
 *
 * 우선순위 (가장 위험한 시설 기준):
 *   - 변전소 여유 없음    → red
 *   - 주변압기 여유 없음   → yellow
 *   - 배전선로 여유 없음   → green
 *   - 모두 여유 있음       → blue
 *
 * Materialized View의 *_no_cap 카운트 기반으로 판단
 * - 마을에 한 행이라도 "여유 없음"이면 그 시설은 위험
 */
import type { MapSummaryRow, MarkerColor } from "./types";

export function colorForMarker(row: MapSummaryRow): MarkerColor {
  if (row.subst_no_cap > 0) return "red";
  if (row.mtr_no_cap > 0) return "yellow";
  if (row.dl_no_cap > 0) return "green";
  return "blue";
}

export const COLOR_HEX: Record<MarkerColor, string> = {
  red: "#EF4444",
  yellow: "#EAB308",
  green: "#22C55E",
  blue: "#3B82F6",
};

export const COLOR_LABEL: Record<MarkerColor, string> = {
  red: "변전소 여유 없음",
  yellow: "주변압기 여유 없음",
  green: "배전선로 여유 없음",
  blue: "여유 충분",
};

// ─────────────────────────────────────────────
// 새 마커 모델 — 3시설 병렬 표시
//   변전소 / 주변압기 / 배전선로 각각의 부족 여부를 동시에 보여주기 위함.
//   기존 colorForMarker 는 우선순위 1색 방식이라 한 가지 위험만 보였으나,
//   사용자는 세 시설 상태를 한눈에 비교하길 원함.
// ─────────────────────────────────────────────
export interface MarkerStatus {
  /** 변전소 여유 부족 (마을 안에 한 행이라도 부족) */
  substRed: boolean;
  /** 주변압기 여유 부족 */
  mtrRed: boolean;
  /** 배전선로 여유 부족 */
  dlRed: boolean;
}

export function statusForMarker(row: MapSummaryRow): MarkerStatus {
  return {
    substRed: row.subst_no_cap > 0,
    mtrRed: row.mtr_no_cap > 0,
    dlRed: row.dl_no_cap > 0,
  };
}

/**
 * 마을 한 곳의 시설별 "부족 비율(%)" — 마커 줄을 비율 막대로 그릴 때 사용.
 * 예: substNoPct = 70 → 변전소 줄의 70% 길이가 빨강(부족), 나머지 30%가 파랑(여유)
 */
export interface MarkerRatios {
  substNoPct: number;
  mtrNoPct: number;
  dlNoPct: number;
}

export function ratiosForMarker(row: MapSummaryRow): MarkerRatios {
  const t = row.total || 0;
  return {
    substNoPct: t > 0 ? (row.subst_no_cap / t) * 100 : 0,
    mtrNoPct: t > 0 ? (row.mtr_no_cap / t) * 100 : 0,
    dlNoPct: t > 0 ? (row.dl_no_cap / t) * 100 : 0,
  };
}

/** 새 마커에 사용하는 두 색상 — 부족(빨강) / 여유(파랑) */
export const STATUS_RED = "#EF4444";
export const STATUS_BLUE = "#3B82F6";
