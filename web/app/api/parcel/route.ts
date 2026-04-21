/**
 * GET /api/parcel?lat=X&lng=Y
 *
 * 지도 클릭 시 호출 — 해당 좌표의 필지 정보 + KEPCO 여유용량 반환.
 *
 * 흐름:
 *   1. VWorld WFS 로 필지 정보(폴리곤/지번/지목/주소) 조회
 *   2. 해당 지번으로 KEPCO 여유용량 RPC 조회 (exact → 리 fallback)
 *   3. 병합 응답
 *
 * 인증: 로그인 사용자만.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getParcelByPoint } from "@/lib/vworld/parcel";
import type { KepcoDataRow } from "@/lib/types";

interface CapaRow extends KepcoDataRow {
  match_mode?: "exact" | "li_fallback";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const latStr = request.nextUrl.searchParams.get("lat");
  const lngStr = request.nextUrl.searchParams.get("lng");
  if (!latStr || !lngStr) {
    return NextResponse.json(
      { ok: false, error: "lat/lng 파라미터가 필요합니다." },
      { status: 400 },
    );
  }
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json(
      { ok: false, error: "lat/lng 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  // 1. VWorld 필지 정보 조회
  const parcel = await getParcelByPoint(lat, lng);
  if (!parcel) {
    return NextResponse.json(
      { ok: true, parcel: null, capa: [], matchMode: null },
      // 필지 없는 좌표 (바다/산 등) 는 정상 케이스 — ok:true
    );
  }

  // 2. KEPCO 여유용량 조회 (지번 매칭 → 리 fallback)
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_capa_by_jibun", {
    p_ctp_nm: parcel.ctp_nm,
    p_sig_nm: parcel.sig_nm,
    p_emd_nm: parcel.emd_nm,
    p_li_nm: parcel.li_nm,
    p_jibun: parcel.jibun,
  });

  if (error) {
    console.error("[/api/parcel] get_capa_by_jibun 실패", error);
    // KEPCO 조회 실패해도 필지 정보는 반환 (부분 응답)
    return NextResponse.json({
      ok: true,
      parcel,
      capa: [],
      matchMode: null,
      warning: "KEPCO 여유용량 조회에 실패했습니다.",
    });
  }

  const rows = (data ?? []) as CapaRow[];
  const matchMode = rows[0]?.match_mode ?? null;

  return NextResponse.json(
    {
      ok: true,
      parcel,
      capa: rows,
      matchMode, // 'exact' / 'li_fallback' / null
    },
    {
      headers: {
        // 같은 좌표 재호출 시 CDN 캐시 (5분)
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}
