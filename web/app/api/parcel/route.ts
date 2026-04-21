/**
 * GET /api/parcel?lat=X&lng=Y
 *
 * 지도 클릭 시 호출 — 해당 좌표의 필지 정보 + KEPCO 여유용량 반환.
 *
 * 흐름:
 *   1. VWorld WFS 로 필지 정보(폴리곤/지번/지목/주소) 조회 → JibunInfo + ParcelGeometry
 *   2. JibunInfo 의 지번으로 KEPCO 여유용량 RPC 조회 (exact → 리 fallback)
 *   3. 병합 응답
 *
 * 인증: 로그인 사용자만.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getParcelByPoint } from "@/lib/vworld/parcel";
import type { JibunInfo } from "@/lib/vworld/parcel";
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

  // 1. VWorld 필지 정보 조회 — { jibun, geometry }
  const result = await getParcelByPoint(lat, lng);
  if (!result) {
    return NextResponse.json({
      ok: true,
      jibun: null,
      geometry: null,
      capa: [],
      matchMode: null,
    });
  }

  // 2. KEPCO 여유용량 조회 — 지번을 키로
  const capa = await fetchKepcoCapa(result.jibun);

  return NextResponse.json(
    {
      ok: true,
      jibun: result.jibun,
      geometry: result.geometry,
      capa: capa.rows,
      matchMode: capa.matchMode,
      warning: capa.warning,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}

/**
 * 지번 → KEPCO 여유용량.
 * JibunInfo 하나만 있으면 좌표 진입/지번 직접 진입 구분 없이 동일 동작.
 * 미래 검색 메뉴에서 지번 직접 입력 시에도 재활용 가능.
 */
async function fetchKepcoCapa(jibun: JibunInfo): Promise<{
  rows: CapaRow[];
  matchMode: "exact" | "li_fallback" | null;
  warning?: string;
}> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_capa_by_jibun", {
    p_ctp_nm: jibun.ctp_nm,
    p_sig_nm: jibun.sig_nm,
    p_emd_nm: jibun.emd_nm,
    p_li_nm: jibun.li_nm,
    p_jibun: jibun.jibun,
  });

  if (error) {
    console.error("[/api/parcel] get_capa_by_jibun 실패", error);
    return {
      rows: [],
      matchMode: null,
      warning: "KEPCO 여유용량 조회에 실패했습니다.",
    };
  }
  const rows = (data ?? []) as CapaRow[];
  return { rows, matchMode: rows[0]?.match_mode ?? null };
}
