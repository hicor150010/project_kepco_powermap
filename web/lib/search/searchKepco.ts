/**
 * 주소·지번 검색 — Supabase RPC 호출 래퍼.
 *
 * RPC `search_kepco`가 모든 무거운 일을 처리한다 (007_search_indexes.sql).
 * 여기서는 입력 정규화 + 응답 타입 매핑만 담당.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { KepcoDataRow } from "@/lib/types";

/** 리 단위 그룹 결과 한 행 */
export interface SearchRiResult {
  addr_do: string | null;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
  geocode_address: string;
  cnt: number;
  lat: number | null;
  lng: number | null;
}

export interface SearchKepcoResult {
  ri: SearchRiResult[];
  ji: KepcoDataRow[];
  /** 지번 정확 매칭 실패 → 근접으로 폴백한 경우 true */
  jiFallback: boolean;
  /** 검색 범위가 너무 광범위해서 폴백 차단된 경우 (시/군 추가 필요 안내용) */
  tooBroad: boolean;
}

interface SearchOptions {
  keywords: string[];
  lotNo: number | null;
  riLimit?: number;
  jiLimit?: number;
}

export async function searchKepco({
  keywords,
  lotNo,
  riLimit = 20,
  jiLimit = 10,
}: SearchOptions): Promise<SearchKepcoResult> {
  // 키워드 없으면 즉시 빈 결과
  if (keywords.length === 0) {
    return { ri: [], ji: [], jiFallback: false, tooBroad: false };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("search_kepco", {
    keywords,
    lot_no: lotNo,
    ri_limit: riLimit,
    ji_limit: jiLimit,
  });

  if (error) {
    throw new Error(`검색 실패: ${error.message}`);
  }

  // RPC가 JSONB로 반환 → { ri, ji, ji_fallback, too_broad }
  const payload = (data ?? {}) as {
    ri?: SearchRiResult[];
    ji?: KepcoDataRow[];
    ji_fallback?: boolean;
    too_broad?: boolean;
  };

  return {
    ri: payload.ri ?? [],
    ji: payload.ji ?? [],
    jiFallback: payload.ji_fallback ?? false,
    tooBroad: payload.too_broad ?? false,
  };
}
