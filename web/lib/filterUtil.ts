/**
 * 필터 공통 유틸 — 여유용량 카테고리 매칭.
 *
 * 새 모델: 마을 한 곳의 시설별 부족 비율을 3단으로 분류한다.
 *
 *   "전부 여유"  → 그 마을의 해당 시설 데이터가 모두 여유 있음 (noCap === 0)
 *   "일부 부족"  → 일부만 부족   (0 < noCap < total)
 *   "전부 부족"  → 모두 부족    (noCap === total)
 *
 * FilterPanel과 MapClient 양쪽에서 사용 (한 곳에서만 정의 → 일관성).
 */

import type { ColumnFilters } from "./types";

export const VOLUME_CATEGORIES = ["전부 여유", "일부 부족", "전부 부족"] as const;
export type VolumeCategory = (typeof VOLUME_CATEGORIES)[number];

/**
 * 마을 한 곳이 선택된 카테고리 조건과 일치하는지 검사.
 * - 빈 Set이면 "전체" → 항상 통과
 * - 여러 카테고리 선택 시 OR 매칭
 */
export function matchesVolumeFilter(
  noCap: number,
  total: number,
  selected: Set<string>
): boolean {
  if (selected.size === 0) return true;
  if (total <= 0) return false;

  const isAllOk = noCap === 0;
  const isAllNo = noCap === total;
  const isPartial = !isAllOk && !isAllNo;

  if (selected.has("전부 여유") && isAllOk) return true;
  if (selected.has("일부 부족") && isPartial) return true;
  if (selected.has("전부 부족") && isAllNo) return true;
  return false;
}

/**
 * ColumnFilters 객체에 활성 필터가 하나라도 있는지.
 * 검색 결과가 필터에 가려졌는지 판단할 때 사용.
 */
export function hasAnyFilter(filters: ColumnFilters): boolean {
  return Object.values(filters).some((s) => s instanceof Set && s.size > 0);
}
