/**
 * GET /api/location?addr=...
 * - 마커 클릭 시 호출
 * - 해당 마을(geocode_address)의 모든 raw 데이터 반환
 * - 인증된 사용자만
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LocationDetailResponse, KepcoDataRow } from "@/lib/types";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const addr = request.nextUrl.searchParams.get("addr");
  if (!addr) {
    return NextResponse.json(
      { ok: false, error: "addr 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kepco_data")
    .select("*")
    .eq("geocode_address", addr)
    .order("addr_jibun", { ascending: true })
    .order("subst_nm", { ascending: true })
    .order("mtr_no", { ascending: true })
    .order("dl_nm", { ascending: true });

  if (error) {
    console.error("[location] 조회 실패", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as KepcoDataRow[];

  const response: LocationDetailResponse = {
    geocode_address: addr,
    rows,
    total: rows.length,
  };

  return NextResponse.json(response);
}
