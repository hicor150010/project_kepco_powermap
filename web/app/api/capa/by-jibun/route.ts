/**
 * GET /api/capa/by-jibun?bjd_code=...&jibun=...
 *
 * Atomic endpoint — 지번 단위 KEPCO 용량 정확 매칭 (exact only).
 * 가까운 본번 폴백은 별도 endpoint (/api/capa/nearest-by-jibun) 에서 제공.
 *
 * 사용처:
 *   - 지번 클릭 (사이드바) — bjd_code + jibun 직접 보유
 *   - 지도 클릭 — /api/parcel/by-latlng 응답에서 PNU → bjd_code + jibun 추출 후
 *
 * 응답 (성공):
 *   { ok: true, bjd_code, jibun, rows: KepcoDataRow[], total }
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KepcoDataRow } from "@/lib/types";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const bjdCode = request.nextUrl.searchParams.get("bjd_code");
  const jibun = request.nextUrl.searchParams.get("jibun");
  if (!bjdCode || !jibun) {
    return NextResponse.json(
      { ok: false, error: "bjd_code, jibun 파라미터 모두 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kepco_capa")
    .select("*")
    .eq("bjd_code", bjdCode)
    .eq("addr_jibun", jibun);

  if (error) {
    console.error("[capa/by-jibun] 조회 실패", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as KepcoDataRow[];
  return NextResponse.json(
    {
      ok: true,
      bjd_code: bjdCode,
      jibun,
      rows,
      total: rows.length,
    },
    {
      headers: { "Cache-Control": "no-store" },   // 크롤이 갱신 — 캐시 X
    }
  );
}
