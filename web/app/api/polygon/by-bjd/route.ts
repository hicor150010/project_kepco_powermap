/**
 * GET /api/polygon/by-bjd?bjd_code=...
 *
 * Atomic endpoint — 행정구역(리/읍면동) 폴리곤 + 중심좌표.
 * VWorld lt_c_adri / lt_c_ademd WFS.
 *
 * 사용처:
 *   - 지도 마커 클릭 — 마을 경계 시각화
 *
 * 응답:
 *   - 매칭 성공: { ok: true, bjd_code, level, full_nm, polygon, center }
 *   - 매칭 실패: { ok: true, bjd_code, level: null, full_nm: null, polygon: null, center: null }
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminPolygonByBjd } from "@/lib/vworld/admin-polygon";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const bjdCode = (request.nextUrl.searchParams.get("bjd_code") || "").trim();
  if (!/^\d{10}$/.test(bjdCode)) {
    return NextResponse.json(
      { ok: false, error: "bjd_code 는 10자리 숫자여야 합니다." },
      { status: 400 }
    );
  }

  const result = await getAdminPolygonByBjd(bjdCode);
  if (!result) {
    return NextResponse.json(
      {
        ok: true,
        bjd_code: bjdCode,
        level: null,
        full_nm: null,
        polygon: null,
        center: null,
      },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  }
  return NextResponse.json(
    { ok: true, ...result },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    }
  );
}
