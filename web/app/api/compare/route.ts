/**
 * GET /api/compare?date=2026-04-01
 * 특정 날짜 이후 상태(vol_subst/mtr/dl)가 변경된 지번 목록 반환
 * → 마을(geocode_address) 단위로 집계하여 지도에 표시
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CompareRow {
  geocode_address: string;
  lat: number;
  lng: number;
  addr_do: string;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
  // 현재
  cur_vol_subst: string | null;
  cur_vol_mtr: string | null;
  cur_vol_dl: string | null;
  cur_subst_capa: number | null;
  cur_subst_pwr: number | null;
  cur_mtr_capa: number | null;
  cur_mtr_pwr: number | null;
  cur_dl_capa: number | null;
  cur_dl_pwr: number | null;
  // 이전
  prev_vol_subst: string | null;
  prev_vol_mtr: string | null;
  prev_vol_dl: string | null;
  prev_subst_capa: number | null;
  prev_subst_pwr: number | null;
  prev_mtr_capa: number | null;
  prev_mtr_pwr: number | null;
  prev_dl_capa: number | null;
  prev_dl_pwr: number | null;
  changed_count: number;
}

export interface CompareResponse {
  ok: boolean;
  since: string;
  rows: CompareRow[];
  total: number;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(
      { ok: false, error: "date 파라미터가 필요합니다. (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_changes_since", {
    since_date: dateParam,
  });

  if (error) {
    console.error("[compare] RPC 실패:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as CompareRow[];

  return NextResponse.json({
    ok: true,
    since: dateParam,
    rows,
    total: rows.length,
  } satisfies CompareResponse);
}
