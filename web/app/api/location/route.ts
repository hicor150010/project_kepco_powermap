/**
 * GET /api/location?bjd_code=...
 * - 마커 클릭 시 호출
 * - 해당 마을(bjd_code)의 모든 raw 데이터 반환
 * - kepco_capa + bjd_master JOIN (RPC: get_location_detail)
 * - 인증된 사용자만
 *
 * bjd_code 는 행안부 법정동코드 10자리. MV 마커 데이터에 이미 포함됨.
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

  const bjdCode = request.nextUrl.searchParams.get("bjd_code");
  if (!bjdCode) {
    return NextResponse.json(
      { ok: false, error: "bjd_code 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_location_detail", {
    p_bjd_code: bjdCode,
  });

  if (error) {
    console.error("[location] 조회 실패", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as KepcoDataRow[];

  const response: LocationDetailResponse = {
    bjd_code: bjdCode,
    geocode_address: rows[0]?.geocode_address ?? "",
    rows,
    total: rows.length,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=60",
    },
  });
}
