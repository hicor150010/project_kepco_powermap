/**
 * Client-side fetch wrappers — KEPCO 용량 atomic endpoints.
 *
 * 컴포넌트는 이 파일의 함수만 호출 (fetch URL 인라인 금지 — URL 변경 시 grep 한 곳만).
 * 응답의 raw row 는 주소 필드 없음 (kepco_capa 컬럼만) → 사용 직전
 * enrichKepcoCapaRowsWithVillageInfo() 로 마을 정보 합성 필요.
 *
 * Endpoint ↔ 함수 매핑 (네이밍 컨벤션 [verb][Source][Entity][By+Input]):
 *   /api/capa/by-bjd   ↔ fetchKepcoCapaByBjdCode
 *   /api/capa/by-jibun ↔ fetchKepcoCapaByJibun
 */
import type { KepcoDataRow } from "@/lib/types";

interface CapaApiResponse {
  ok: boolean;
  bjd_code?: string;
  jibun?: string;
  rows?: KepcoDataRow[];
  total?: number;
  error?: string;
}

/** /api/capa/by-bjd — 마을 단위 KEPCO 용량 raw rows (정렬: addr_jibun, subst_nm, mtr_no, dl_nm) */
export async function fetchKepcoCapaByBjdCode(
  bjdCode: string,
): Promise<KepcoDataRow[]> {
  const res = await fetch(
    `/api/capa/by-bjd?bjd_code=${encodeURIComponent(bjdCode)}`,
  );
  const data = (await res.json()) as CapaApiResponse;
  if (!data.ok) throw new Error(data.error || "마을 용량 조회 실패");
  return data.rows ?? [];
}

/** /api/capa/by-jibun — 지번 단위 KEPCO 용량 raw rows (exact match only). nearest 폴백은 별도 endpoint. */
export async function fetchKepcoCapaByJibun(
  bjdCode: string,
  jibun: string,
): Promise<KepcoDataRow[]> {
  const res = await fetch(
    `/api/capa/by-jibun?bjd_code=${encodeURIComponent(bjdCode)}&jibun=${encodeURIComponent(jibun)}`,
  );
  const data = (await res.json()) as CapaApiResponse;
  if (!data.ok) throw new Error(data.error || "지번 용량 조회 실패");
  return data.rows ?? [];
}
