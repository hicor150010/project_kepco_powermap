/**
 * Client-side fetch wrappers — 건축물대장 atomic endpoints.
 *
 * 컴포넌트는 이 파일의 함수만 호출 (vendor 추상화 — 컴포넌트는 건축HUB 모름).
 *
 * 캐시:
 *   - by-pnu: 모듈 scope Map (페이지 라이프타임). 같은 PNU 재클릭 0회 fetch.
 *   - 빈배열 결과(rows.length===0)도 캐시 (재호출 방지).
 *
 * Endpoint ↔ 함수:
 *   /api/buildings/by-pnu ↔ fetchBuildingsByPnu
 */
import type { BuildingTitleInfo } from "@/lib/building-hub/title";

interface BuildingsApiResponse {
  ok: boolean;
  pnu?: string;
  rows?: BuildingTitleInfo[];
  error?: string;
}

interface FetchOptions {
  signal?: AbortSignal;
}

const buildingsByPnuCache = new Map<string, BuildingTitleInfo[]>();

/** /api/buildings/by-pnu — PNU → 건축물대장 표제부 rows. 캐시 키 = PNU. */
export async function fetchBuildingsByPnu(
  pnu: string,
  options?: FetchOptions,
): Promise<BuildingTitleInfo[]> {
  const cached = buildingsByPnuCache.get(pnu);
  if (cached) return cached;

  const res = await fetch(
    `/api/buildings/by-pnu?pnu=${encodeURIComponent(pnu)}`,
    { signal: options?.signal },
  );
  const data = (await res.json()) as BuildingsApiResponse;
  if (!data.ok) throw new Error(data.error || "건축물대장 조회 실패");
  const rows = data.rows ?? [];
  buildingsByPnuCache.set(pnu, rows);
  return rows;
}

/** 캐시 초기화 (보통 호출 X — 건축물대장은 거의 안 변함) */
export function clearBuildingsCache(): void {
  buildingsByPnuCache.clear();
}

export type { BuildingTitleInfo };
