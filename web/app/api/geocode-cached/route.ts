import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/geocode-cached?village=경상북도+고령군+개진면+양전리
 *
 * 해당 마을의 지번 중 geocode_cache에 좌표가 저장된 것만 반환.
 * 지오코딩 호출 없이 DB 조회만 수행.
 *
 * 쿼리: address LIKE '{village} %' (마을 주소 + 공백 + 지번)
 */
export async function GET(request: NextRequest) {
  const village = request.nextUrl.searchParams.get("village");
  if (!village) {
    return NextResponse.json({ pins: [] });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("geocode_cache")
    .select("address, lat, lng")
    .like("address", `${village} %`);

  if (error || !data) {
    return NextResponse.json({ pins: [] });
  }

  // address에서 마을 주소를 빼면 지번만 남음
  const prefix = village + " ";
  const pins = data.map((row) => ({
    jibun: row.address.slice(prefix.length),
    lat: row.lat,
    lng: row.lng,
  }));

  return NextResponse.json({ pins });
}
