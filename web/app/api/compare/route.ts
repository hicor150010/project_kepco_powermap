/**
 * GET /api/compare?subst=any&mtr=any&dl=gained
 * ref(기준 스냅샷) vs 현재 kepco_capa 비교
 * 시설별 필터: any / same / gained / lost
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CompareRefRow {
  geocode_address: string;
  lat: number;
  lng: number;
  addr_do: string;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
  prev_subst_ok: boolean;
  prev_mtr_ok: boolean;
  prev_dl_ok: boolean;
  curr_subst_ok: boolean;
  curr_mtr_ok: boolean;
  curr_dl_ok: boolean;
  changed_count: number;
}

export interface CompareRefResponse {
  ok: boolean;
  rows: CompareRefRow[];
  total: number;
}

const VALID_FILTERS = new Set(["any", "same", "gained", "lost"]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const substFilter = sp.get("subst") || "any";
  const mtrFilter = sp.get("mtr") || "any";
  const dlFilter = sp.get("dl") || "any";

  // 유효성 검사
  if (!VALID_FILTERS.has(substFilter) || !VALID_FILTERS.has(mtrFilter) || !VALID_FILTERS.has(dlFilter)) {
    return NextResponse.json(
      { ok: false, error: "필터 값은 any/same/gained/lost 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("compare_with_ref", {
    subst_filter: substFilter,
    mtr_filter: mtrFilter,
    dl_filter: dlFilter,
  });

  if (error) {
    console.error("[compare] RPC 실패:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as CompareRefRow[];

  return NextResponse.json({
    ok: true,
    rows,
    total: rows.length,
  } satisfies CompareRefResponse);
}
