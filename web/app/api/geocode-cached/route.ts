/**
 * GET /api/geocode-cached?village=경상북도+고령군+개진면+양전리
 *
 * 해당 마을에서 이전에 클릭해 KV 에 캐시된 지번 좌표 목록을 반환.
 * (2026-04-22 정책 변경: geocode_cache DB 읽기 중단, KV 만 참조)
 *
 * 지번 단위 좌표는 DB 에 저장하지 않고 Vercel KV 에 TTL 3일 캐시.
 * 이 엔드포인트는 마을 진입 시 핀 복원용.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCachedVillagePins } from "@/lib/cache/parcelKv";

export async function GET(request: NextRequest) {
  const village = request.nextUrl.searchParams.get("village");
  if (!village) {
    return NextResponse.json({ pins: [] });
  }

  const pins = await getCachedVillagePins(village);
  return NextResponse.json({ pins });
}
