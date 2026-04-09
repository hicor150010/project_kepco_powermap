/**
 * KEPCO 웹 지도 — 공통 타입 정의
 */

// ──────────────────────────────────────────
// DB 스키마와 1:1 매핑
// ──────────────────────────────────────────

/** kepco_data 테이블 한 행 (raw 데이터) */
export interface KepcoDataRow {
  id: number;
  addr_do: string;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
  addr_jibun: string | null;
  geocode_address: string;
  lat: number | null;
  lng: number | null;
  subst_nm: string | null;
  mtr_no: string | null;
  dl_nm: string | null;
  vol_subst: string | null;
  vol_mtr: string | null;
  vol_dl: string | null;
  subst_capa: number | null;
  subst_pwr: number | null;
  g_subst_capa: number | null;
  mtr_capa: number | null;
  mtr_pwr: number | null;
  g_mtr_capa: number | null;
  dl_capa: number | null;
  dl_pwr: number | null;
  g_dl_capa: number | null;
  step1_cnt: number | null;
  step1_pwr: number | null;
  step2_cnt: number | null;
  step2_pwr: number | null;
  step3_cnt: number | null;
  step3_pwr: number | null;
  updated_at: string;
}

/** kepco_map_summary 한 행 (지도 마커용) */
export interface MapSummaryRow {
  geocode_address: string;
  lat: number;
  lng: number;
  total: number;
  subst_no_cap: number;
  mtr_no_cap: number;
  dl_no_cap: number;
  addr_do: string | null;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
  subst_names: string[] | null;
  dl_names: string[] | null;
  /** 변전소 잔여 (kW) — 마을 안 시설별 최대 잔여 */
  subst_remaining_kw: number;
  /** 주변압기 잔여 (kW) */
  mtr_remaining_kw: number;
  /** 배전선로 잔여 (kW) */
  dl_remaining_kw: number;
  /** 종합 — 세 시설 중 가장 큰 잔여. 사업 가능 최대 직관 표현 */
  max_remaining_kw: number;
}

// ──────────────────────────────────────────
// API 응답
// ──────────────────────────────────────────

export interface MapSummaryResponse {
  rows: MapSummaryRow[];
  total: number;
  generatedAt: string;
}

export interface LocationDetailResponse {
  geocode_address: string;
  rows: KepcoDataRow[];
  total: number;
}

// ──────────────────────────────────────────
// UI/필터 상태
// ──────────────────────────────────────────

/** 마커 색상 — 가장 위험한 시설 기준 */
export type MarkerColor = "red" | "blue" | "yellow" | "green";

/** 컬럼별 필터 (빈 Set이면 전체 통과) */
export interface ColumnFilters {
  addr_do: Set<string>;
  addr_gu: Set<string>;
  addr_dong: Set<string>;
  addr_li: Set<string>;
  subst_nm: Set<string>;
  dl_nm: Set<string>;
  /** "전체" / "있음" / "없음" — 단일 선택 */
  vol_subst: Set<string>;
  vol_mtr: Set<string>;
  vol_dl: Set<string>;
}

export function emptyFilters(): ColumnFilters {
  return {
    addr_do: new Set(),
    addr_gu: new Set(),
    addr_dong: new Set(),
    addr_li: new Set(),
    subst_nm: new Set(),
    dl_nm: new Set(),
    vol_subst: new Set(),
    vol_mtr: new Set(),
    vol_dl: new Set(),
  };
}
