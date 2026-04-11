/**
 * GET /api/map-summary
 * - 지도 마커용 Light 데이터 (마을 단위 집계)
 * - 인증된 사용자만 접근
 * - kepco_map_summary (Materialized View) 전체 반환
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MapSummaryResponse, MapSummaryRow } from "@/lib/types";

export async function GET() {
  // 인증 체크
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  // service_role로 조회 (RLS 우회 — Materialized View는 RLS 적용 어려움)
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kepco_map_summary")
    .select(
      "geocode_address, lat, lng, total, subst_no_cap, mtr_no_cap, dl_no_cap, addr_do, addr_si, addr_gu, addr_dong, addr_li, subst_names, dl_names, subst_remaining_kw, mtr_remaining_kw, dl_remaining_kw, max_remaining_kw"
    );

  if (error) {
    console.error("[map-summary] 조회 실패", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as MapSummaryRow[];

  const response: MapSummaryResponse = {
    rows,
    total: rows.length,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=60",
    },
  });
}
