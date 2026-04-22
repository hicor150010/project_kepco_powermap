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
import { getParcelByPoint } from "@/lib/vworld/parcel";
import { fetchKepcoCapa } from "@/lib/kepco/capaByJibun";

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

  const capa = await fetchKepcoCapa(result.jibun);

  return NextResponse.json(
    {
      ok: true,
      jibun: result.jibun,
      geometry: result.geometry,
      capa: capa.rows,
      matchMode: capa.matchMode,
      nearestJibun: capa.nearestJibun,
      warning: capa.warning,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}
