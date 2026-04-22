/**
 * GET /api/parcel-by-address?address=...&village=...
 *
 * 검색결과에서 지번 클릭 시 호출 — 주소로 VWorld 필지 조회 + KEPCO 여유용량.
 *
 * address 는 "시도 시군구 읍면동 (리) 지번" 전체 주소 (VWorld 검색 API 용).
 * village 는 "시도 시군구 읍면동 (리)" (KV 마을 인덱스 키용, 선택).
 *
 * 캐시 정책:
 *   - VWorld 결과(ParcelResult) 만 KV 에 TTL 3일
 *   - KEPCO 결과는 매번 조회 (크롤링으로 변동 가능)
 *   - DB geocode_cache 저장 안 함 (마을 단위만 유지)
 *
 * 인증: 로그인 사용자만.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getParcelByAddress } from "@/lib/vworld/parcel";
import { fetchKepcoCapa } from "@/lib/kepco/capaByJibun";
import {
  getCachedParcel,
  setCachedParcel,
} from "@/lib/cache/parcelKv";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const address = request.nextUrl.searchParams.get("address");
  const village = request.nextUrl.searchParams.get("village");
  if (!address) {
    return NextResponse.json(
      { ok: false, error: "address 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  // 1) VWorld 필지정보 — KV 캐시 우선
  let parcel = await getCachedParcel(address);
  const fromCache = !!parcel;
  if (!parcel) {
    parcel = await getParcelByAddress(address);
    if (parcel) {
      await setCachedParcel(address, village, parcel);
    }
  }

  if (!parcel) {
    return NextResponse.json({
      ok: true,
      jibun: null,
      geometry: null,
      capa: [],
      matchMode: null,
      cached: fromCache,
    });
  }

  // 2) KEPCO 여유용량 — 캐시 안 함
  const capa = await fetchKepcoCapa(parcel.jibun);

  return NextResponse.json(
    {
      ok: true,
      jibun: parcel.jibun,
      geometry: parcel.geometry,
      capa: capa.rows,
      matchMode: capa.matchMode,
      nearestJibun: capa.nearestJibun,
      warning: capa.warning,
      cached: fromCache,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
