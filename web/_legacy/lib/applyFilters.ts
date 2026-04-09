import type { LocationData, ColumnFilters } from "./types";

/** 컬럼 필터 적용 (AND 조건) */
export function applyFilters(
  items: LocationData[],
  filters: ColumnFilters
): LocationData[] {
  return items.filter((item) => {
    if (filters.addr_do.size > 0 && !filters.addr_do.has(item.addr_do)) return false;
    if (filters.addr_gu.size > 0 && !filters.addr_gu.has(item.addr_gu)) return false;
    if (filters.subst_nm.size > 0 && !filters.subst_nm.has(item.subst_nm)) return false;
    if (filters.dl_nm.size > 0 && !filters.dl_nm.has(item.dl_nm)) return false;
    if (filters.vol_subst.size > 0 && !filters.vol_subst.has(item.vol_subst)) return false;
    if (filters.vol_mtr.size > 0 && !filters.vol_mtr.has(item.vol_mtr)) return false;
    if (filters.vol_dl.size > 0 && !filters.vol_dl.has(item.vol_dl)) return false;
    return true;
  });
}

/** 데이터에서 특정 필드의 고유값 추출 (정렬됨) */
export function uniqueValues(
  items: LocationData[],
  key: keyof LocationData
): string[] {
  const set = new Set<string>();
  items.forEach((item) => {
    const v = item[key];
    if (typeof v === "string" && v) set.add(v);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}
