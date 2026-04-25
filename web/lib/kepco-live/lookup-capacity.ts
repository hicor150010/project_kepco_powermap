/**
 * 한글주소(또는 bjd_code) + 지번 → kepco_capa 결과 조회.
 *
 * 4 단계 orchestrator:
 *   1. addr 입력 → parseKoreanAddress → bjd_code (bjd_master 매칭)
 *      bjd_code 입력 → bjd_master 에서 sep_1~5 역추출 (KEPCO 호출 후보 위해)
 *   2. refresh=false (기본): kepco_capa SELECT → DB hit 시 즉시 반환
 *   3. DB miss / refresh=true: buildKepcoCandidates → callKepcoSearch 순회
 *      (첫 비어있지 않은 결과 채택)
 *   4. upsertKepcoCapa(bjd_code, jibun, kepcoRows) → DB 다시 SELECT 후 반환
 *
 * 활용:
 *   - 지도 클릭 → DB miss 지역 즉시 조회
 *   - 카드 모달 새로고침 (refresh=true)
 *   - 정상 0건 (KEPCO 미보유 번지) → source='not_found'
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { KepcoDataRow } from "@/lib/types";
import {
  parseKoreanAddress,
  type ParsedAddress,
} from "./parse-address";
import {
  buildKepcoCandidates,
  type KepcoCandidate,
} from "./build-candidates";
import {
  callKepcoSearch,
  type KepcoCapacityRow,
} from "./kepco-client";
import { upsertKepcoCapa } from "./upsert-capa";

export interface LookupInput {
  /** 한글주소 (bjd_code 와 둘 중 하나 필수) */
  addr?: string;
  /** bjd_code 직접 입력 (한글주소 없을 때) */
  bjd_code?: string;
  /** 지번 (예: '24-1', '산1-10') */
  jibun: string;
  /** true: 항상 KEPCO 호출 (DB cache 무시). 기본 false */
  refresh?: boolean;
  /** 동분할 변종 후보 추가 (효자동 → 효자동N가 등). 기본 false */
  includeSplitDong?: boolean;
}

export type LookupSource = "db_cache" | "kepco_live" | "not_found";

export interface LookupResult {
  source: LookupSource;
  bjd_code: string | null;
  addr_jibun: string;
  rows: KepcoDataRow[];
  fetched_at: string;
  /** kepco_live 일 때만 — 어떤 후보가 매칭됐는지 디버그용 */
  candidate_used?: KepcoCandidate;
}

async function resolveBjdCodeFromParsed(parsed: ParsedAddress): Promise<string | null> {
  const supabase = createAdminClient();
  let q = supabase.from("bjd_master").select("bjd_code");
  for (const k of ["sep_1", "sep_2", "sep_3", "sep_4", "sep_5"] as const) {
    const v = parsed[k];
    q = v == null ? q.is(k, null) : q.eq(k, v);
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(`bjd_master lookup: ${error.message}`);
  return data?.bjd_code ?? null;
}

async function loadParsedFromBjdCode(bjd_code: string): Promise<ParsedAddress | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bjd_master")
    .select("sep_1,sep_2,sep_3,sep_4,sep_5")
    .eq("bjd_code", bjd_code)
    .maybeSingle();
  if (error) throw new Error(`bjd_master fetch: ${error.message}`);
  if (!data) return null;
  return {
    sep_1: data.sep_1,
    sep_2: data.sep_2,
    sep_3: data.sep_3,
    sep_4: data.sep_4,
    sep_5: data.sep_5,
    jibun: "",
    original: "",
  };
}

async function fetchCapaFromDb(
  bjd_code: string,
  jibun: string,
): Promise<KepcoDataRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kepco_capa")
    .select("*")
    .eq("bjd_code", bjd_code)
    .eq("addr_jibun", jibun);
  if (error) throw new Error(`kepco_capa fetch: ${error.message}`);
  return (data ?? []) as KepcoDataRow[];
}

export async function lookupCapacity(input: LookupInput): Promise<LookupResult> {
  if (!input.addr && !input.bjd_code) {
    throw new Error("addr 또는 bjd_code 둘 중 하나 필수");
  }
  const fetched_at = new Date().toISOString();

  // 1. ParsedAddress + bjd_code 도출
  let parsed: ParsedAddress | null = null;
  let bjd_code: string | null = input.bjd_code ?? null;

  if (input.addr) {
    parsed = parseKoreanAddress(input.addr);
    if (!bjd_code) bjd_code = await resolveBjdCodeFromParsed(parsed);
  } else if (bjd_code) {
    parsed = await loadParsedFromBjdCode(bjd_code);
    if (!parsed) {
      throw new Error(`bjd_code '${bjd_code}' 가 bjd_master 에 없음`);
    }
  }

  if (!bjd_code) {
    return {
      source: "not_found",
      bjd_code: null,
      addr_jibun: input.jibun,
      rows: [],
      fetched_at,
    };
  }

  // 2. DB hit 시도 (refresh=false 기본)
  if (!input.refresh) {
    const dbRows = await fetchCapaFromDb(bjd_code, input.jibun);
    if (dbRows.length > 0) {
      return {
        source: "db_cache",
        bjd_code,
        addr_jibun: input.jibun,
        rows: dbRows,
        fetched_at,
      };
    }
  }

  // 3. KEPCO live 호출 (parsed 보장됨)
  const candidates = buildKepcoCandidates(parsed!, {
    includeSplitDong: input.includeSplitDong,
  });
  let kepcoRows: KepcoCapacityRow[] = [];
  let candidate_used: KepcoCandidate | undefined;
  for (const c of candidates) {
    const res = await callKepcoSearch(
      { do: c.do, si: c.si, gu: c.gu, lidong: c.lidong, li: c.li },
      input.jibun,
    );
    if (res.length > 0) {
      kepcoRows = res;
      candidate_used = c;
      break;
    }
  }

  if (kepcoRows.length === 0) {
    return {
      source: "not_found",
      bjd_code,
      addr_jibun: input.jibun,
      rows: [],
      fetched_at,
    };
  }

  // 4. UPSERT + DB 재조회 (응답 일관성)
  await upsertKepcoCapa(bjd_code, input.jibun, kepcoRows);
  const finalRows = await fetchCapaFromDb(bjd_code, input.jibun);
  return {
    source: "kepco_live",
    bjd_code,
    addr_jibun: input.jibun,
    rows: finalRows,
    fetched_at,
    candidate_used,
  };
}
