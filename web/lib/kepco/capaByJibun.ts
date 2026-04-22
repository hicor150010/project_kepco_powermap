/**
 * 지번 → KEPCO 여유용량 조회 공통 로직.
 * /api/parcel (좌표 진입) 과 /api/parcel-by-address (주소 진입) 둘 다에서 재사용.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { JibunInfo } from "@/lib/vworld/parcel";
import type { KepcoDataRow } from "@/lib/types";

export interface CapaRow extends KepcoDataRow {
  match_mode?: "exact" | "nearest_jibun";
  nearest_jibun?: string | null;
}

export interface CapaResult {
  rows: CapaRow[];
  matchMode: "exact" | "nearest_jibun" | null;
  nearestJibun: string | null;
  warning?: string;
}

export async function fetchKepcoCapa(jibun: JibunInfo): Promise<CapaResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_capa_by_jibun", {
    p_ctp_nm: jibun.ctp_nm,
    p_sig_nm: jibun.sig_nm,
    p_emd_nm: jibun.emd_nm,
    p_li_nm: jibun.li_nm,
    p_jibun: jibun.jibun,
  });

  if (error) {
    console.error("[capaByJibun] get_capa_by_jibun 실패", error);
    return {
      rows: [],
      matchMode: null,
      nearestJibun: null,
      warning: "KEPCO 여유용량 조회에 실패했습니다.",
    };
  }
  const rows = (data ?? []) as CapaRow[];
  return {
    rows,
    matchMode: rows[0]?.match_mode ?? null,
    nearestJibun: rows[0]?.nearest_jibun ?? null,
  };
}
