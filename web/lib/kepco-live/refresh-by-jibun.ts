/**
 * 클라이언트 → POST /api/capa/lookup { refresh: true } 호출 wrapper.
 *
 * 사용처:
 *   - ElectricTab 새로고침 버튼: kepco_capa 강제 갱신 (KEPCO live 호출 + upsert)
 *   - 지도 클릭 시 DB miss 자동 호출 (향후)
 *
 * 단일 책임: HTTP POST + 응답 파싱. 에러는 throw 하지 않고 반환 객체에 담는다.
 * (UI 측에서 분기 처리 — 토스트/inline 표시 등)
 */

import type { KepcoDataRow } from "@/lib/types";

export interface RefreshInput {
  /** 한글주소 (헤더 표시용 행정구역 + 지번). bjd_code 와 둘 중 하나 이상 필수. */
  addr?: string;
  /** bjd_code 직접 (이미 알고 있을 때 — bjd_master 매칭 1회 절약). */
  bjd_code?: string;
  /** 지번 (예: "24-1", "산1-10"). 필수. */
  jibun: string;
}

export type RefreshSource = "db_cache" | "kepco_live" | "not_found";

export interface RefreshResult {
  ok: boolean;
  /** ok=true 일 때만: 어디서 데이터 왔는지 */
  source?: RefreshSource;
  /** ok=true 일 때만: 갱신된 kepco_capa rows */
  rows?: KepcoDataRow[];
  /** ok=true 일 때만: 응답 시각 ISO */
  fetched_at?: string;
  /** ok=false 일 때만: 에러 메시지 */
  error?: string;
}

export async function refreshKepcoCapaByJibun(
  input: RefreshInput,
): Promise<RefreshResult> {
  if (!input.jibun) {
    return { ok: false, error: "jibun 필수" };
  }
  if (!input.addr && !input.bjd_code) {
    return { ok: false, error: "addr 또는 bjd_code 필수" };
  }

  try {
    const res = await fetch("/api/capa/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, refresh: true }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      source: json.source,
      rows: json.rows,
      fetched_at: json.fetched_at,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
