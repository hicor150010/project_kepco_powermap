/**
 * KEPCO 응답 → kepco_capa UPSERT.
 *
 * crawler/crawl_to_db.py 의 _to_capa_row + upsert 룰을 TS 로 포팅:
 *   - 빈 문자열 → NULL (UNIQUE 정합성)
 *   - 숫자 필드: 콤마 제거 + int 변환, 파싱 실패 시 NULL
 *   - UPSERT 키: (bjd_code, addr_jibun, subst_nm, mtr_no, dl_nm)
 *   - updated_at: DB DEFAULT NOW() — upsert 시 자동 갱신
 *
 * STEP 데이터 (step1_cnt 등) 는 KEPCO get_detail 별도 호출이 필요해서
 * 단건 lookup 에서는 NULL 로 둔다 (대량 크롤러만 STEP 수집).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { KepcoCapacityRow } from "./kepco-client";

export interface CapaRowInput {
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
}

export interface UpsertResult {
  upserted: number;
}

export function parseIntSafe(v: number | string | undefined | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** KEPCO 응답 row → kepco_capa 컬럼 형태로 변환. */
export function toCapaRow(
  bjd_code: string,
  addr_jibun: string,
  kepco: KepcoCapacityRow,
): CapaRowInput {
  return {
    bjd_code,
    addr_jibun: emptyToNull(addr_jibun),
    subst_nm: emptyToNull(kepco.SUBST_NM),
    mtr_no: emptyToNull(String(kepco.MTR_NO ?? "")),
    dl_nm: emptyToNull(kepco.DL_NM),
    subst_capa: parseIntSafe(kepco.SUBST_CAPA),
    subst_pwr: parseIntSafe(kepco.SUBST_PWR),
    g_subst_capa: parseIntSafe(kepco.G_SUBST_CAPA),
    mtr_capa: parseIntSafe(kepco.MTR_CAPA),
    mtr_pwr: parseIntSafe(kepco.MTR_PWR),
    g_mtr_capa: parseIntSafe(kepco.G_MTR_CAPA),
    dl_capa: parseIntSafe(kepco.DL_CAPA),
    dl_pwr: parseIntSafe(kepco.DL_PWR),
    g_dl_capa: parseIntSafe(kepco.G_DL_CAPA),
  };
}

export async function upsertKepcoCapa(
  bjd_code: string,
  addr_jibun: string,
  kepcoRows: KepcoCapacityRow[],
): Promise<UpsertResult> {
  if (kepcoRows.length === 0) return { upserted: 0 };

  const rows = kepcoRows.map((r) => toCapaRow(bjd_code, addr_jibun, r));
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("kepco_capa")
    .upsert(rows, {
      onConflict: "bjd_code,addr_jibun,subst_nm,mtr_no,dl_nm",
    });

  if (error) {
    throw new Error(`kepco_capa upsert failed: ${error.message}`);
  }
  return { upserted: rows.length };
}
