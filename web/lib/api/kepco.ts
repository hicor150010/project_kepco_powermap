/**
 * Client-side fetch wrappers — KEPCO 용량 atomic endpoints.
 *
 * 컴포넌트는 이 파일의 함수만 호출 (fetch URL 인라인 금지 — URL 변경 시 grep 한 곳만).
 * 응답의 raw row 는 주소 필드 없음 (kepco_capa 컬럼만) → 사용 직전
 * enrichKepcoCapaRowsWithVillageInfo() 로 마을 정보 합성 필요.
 *
 * 캐시:
 *   - 모듈 scope Map (페이지 라이프타임 동안 유지)
 *   - 같은 키 hit 시 fetch 0회
 *   - 새로고침 (handleRefresh) 시 clearKepcoCapaCache() 로 비움 (크롤이 갱신하므로)
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

interface FetchOptions {
  signal?: AbortSignal;
}

const capaByBjdCache = new Map<string, KepcoDataRow[]>();
const capaByJibunCache = new Map<string, KepcoDataRow[]>();

/** /api/capa/by-bjd — 마을 단위 KEPCO 용량 raw rows. 캐시 키 = bjd_code. */
export async function fetchKepcoCapaByBjdCode(
  bjdCode: string,
  options?: FetchOptions,
): Promise<KepcoDataRow[]> {
  const cached = capaByBjdCache.get(bjdCode);
  if (cached) return cached;

  const res = await fetch(
    `/api/capa/by-bjd?bjd_code=${encodeURIComponent(bjdCode)}`,
    { signal: options?.signal },
  );
  const data = (await res.json()) as CapaApiResponse;
  if (!data.ok) throw new Error(data.error || "마을 용량 조회 실패");
  const rows = data.rows ?? [];
  capaByBjdCache.set(bjdCode, rows);
  return rows;
}

/** /api/capa/by-jibun — 지번 단위 (exact only). 캐시 키 = `${bjd}:${jibun}`. */
export async function fetchKepcoCapaByJibun(
  bjdCode: string,
  jibun: string,
  options?: FetchOptions,
): Promise<KepcoDataRow[]> {
  const key = `${bjdCode}:${jibun}`;
  const cached = capaByJibunCache.get(key);
  if (cached) return cached;

  const res = await fetch(
    `/api/capa/by-jibun?bjd_code=${encodeURIComponent(bjdCode)}&jibun=${encodeURIComponent(jibun)}`,
    { signal: options?.signal },
  );
  const data = (await res.json()) as CapaApiResponse;
  if (!data.ok) throw new Error(data.error || "지번 용량 조회 실패");
  const rows = data.rows ?? [];
  capaByJibunCache.set(key, rows);
  return rows;
}

/** 새로고침 시 호출 — KEPCO 데이터는 크롤이 갱신하므로 새 데이터 받기 위해 비움 */
export function clearKepcoCapaCache(): void {
  capaByBjdCache.clear();
  capaByJibunCache.clear();
}
