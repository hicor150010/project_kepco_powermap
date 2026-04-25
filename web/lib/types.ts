/**
 * KEPCO 웹 지도 — 공통 타입 정의
 */

// ──────────────────────────────────────────
// KEPCO 여유용량 판정 (프론트엔드 공통)
//   없음 = (capa - pwr ≤ 0) OR (capa - g_capa ≤ 0)
//   있음 = (capa - pwr > 0) AND (capa - g_capa > 0)
// ──────────────────────────────────────────

/** KEPCO 수식 기반 여유 판정 — true = 여유 있음 */
export function hasCapacity(
  capa: number | null,
  pwr: number | null,
  gCapa: number | null,
): boolean {
  const r1 = (capa ?? 0) - (pwr ?? 0);
  const r2 = (capa ?? 0) - (gCapa ?? 0);
  return r1 > 0 && r2 > 0;
}

// ──────────────────────────────────────────
// 행정구역 메타 (bjd_master sep_1~5 그대로)
//   sep_1 = 시도 / sep_2 = 시(광역도 안의) / sep_3 = 시군구 / sep_4 = 읍면동 / sep_5 = 리
//   광역시·세종 등은 일부 빈값. 표시 시 filter(Boolean) 으로 자연 처리.
// ──────────────────────────────────────────
export interface AddrMeta {
  sep_1: string | null;
  sep_2: string | null;
  sep_3: string | null;
  sep_4: string | null;
  sep_5: string | null;
}

// ──────────────────────────────────────────
// DB 스키마와 1:1 매핑
// ──────────────────────────────────────────

/**
 * kepco_capa 테이블 한 행 (지번 단위 raw 용량 데이터)
 *
 * DB 컬럼은 bjd_code + 시설/용량만. 주소/좌표는 bjd_master(MV)에 분리.
 * 단, UI 컴포넌트(LocationSummaryCard, LocationDetailModal, SearchResultList)는
 * row.addr_do/li 같은 시멘틱으로 작성돼 있으므로, 클라이언트가 bjd_code → MapSummaryRow
 * 로 enrich 해 optional 필드를 채워 넣는다 (DB 컬럼 아님).
 */
export interface KepcoDataRow {
  id: number;
  /** 행안부 법정동코드 10자리 — bjd_master 참조. 매칭 실패 시 '0000000000'. */
  bjd_code: string;
  addr_jibun: string | null;
  subst_nm: string | null;
  mtr_no: string | null;
  dl_nm: string | null;
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
  // ─── 클라이언트 enrichment (MapSummaryRow 에서 주입, optional) ───
  addr_do?: string | null;
  addr_si?: string | null;
  addr_gu?: string | null;
  addr_dong?: string | null;
  addr_li?: string | null;
  geocode_address?: string;
  lat?: number;
  lng?: number;
}

/** kepco_map_summary 한 행 (지도 마커용) */
export interface MapSummaryRow {
  /** 행안부 법정동코드 10자리 — 마커 클릭 시 RPC 호출 키 */
  bjd_code: string;
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

/**
 * 마을 카드용 집계 (get_location_summary RPC).
 *
 * raw rows 가 평균 383행/마을이라 카드만 보고 닫는 사용자에게 30KB 다운로드는 낭비.
 * 카드는 시설별 비율 6개 숫자만 필요 → 이 타입으로 충분.
 *
 * DB 는 flat 7컬럼이지만 클라이언트는 시설별 중첩 객체 (UI 가 시설 단위로 순회).
 * 변환은 /api/capa/summary-by-bjd route 에서 수행.
 *
 * 합 보장: avail + short = total (hasCapacity 가 NULL→0 처리해 중간값 없음).
 */
export interface KepcoCapaSummary {
  total: number;
  subst: { avail: number; short: number };
  mtr:   { avail: number; short: number };
  dl:    { avail: number; short: number };
}

// ──────────────────────────────────────────
// UI/필터 상태
// ──────────────────────────────────────────

/** 마커 색상 — 가장 위험한 시설 기준 */
export type MarkerColor = "red" | "blue" | "yellow" | "green";

/** 컬럼별 필터 (빈 Set이면 전체 통과) */
export interface ColumnFilters {
  addr_do: Set<string>;
  addr_si: Set<string>;
  addr_gu: Set<string>;
  addr_dong: Set<string>;
  addr_li: Set<string>;
  subst_nm: Set<string>;
  dl_nm: Set<string>;
  /** 마을 단위 여유 상태: "전부 여유" / "일부 부족" / "전부 부족" */
  cap_subst: Set<string>;
  cap_mtr: Set<string>;
  cap_dl: Set<string>;
}

export function emptyFilters(): ColumnFilters {
  return {
    addr_do: new Set(),
    addr_si: new Set(),
    addr_gu: new Set(),
    addr_dong: new Set(),
    addr_li: new Set(),
    subst_nm: new Set(),
    dl_nm: new Set(),
    cap_subst: new Set(),
    cap_mtr: new Set(),
    cap_dl: new Set(),
  };
}
