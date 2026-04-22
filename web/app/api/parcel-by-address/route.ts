/**
 * GET /api/parcel-by-address?address=...&village=...
 *   &addr_do=...&addr_si=...&addr_gu=...&addr_dong=...&addr_li=...&addr_jibun=...
 *
 * 지번 클릭 시 호출 — VWorld 필지정보 + KEPCO 여유용량 **병렬** 반환.
 *
 * 파라미터:
 *   address   전체 주소 문자열 (VWorld 검색 API 입력)
 *   village   마을 주소 (KV 인덱스 키)
 *   addr_*    KEPCO RPC 입력 (VWorld 응답 기다리지 않고 바로 RPC 호출)
 *
 * 캐시:
 *   VWorld 결과만 KV TTL 3일. KEPCO 는 매번 조회.
 *
 * 병렬화 (2026-04-22):
 *   기존 — VWorld → KEPCO (직렬, ~1.1s)
 *   수정 — Promise.all([VWorld, KEPCO]) (병렬, 가장 느린 것 시간만)
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getParcelByAddress } from "@/lib/vworld/parcel";
import { fetchKepcoCapa } from "@/lib/kepco/capaByJibun";
import { getCachedParcel, setCachedParcel } from "@/lib/cache/parcelKv";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const address = sp.get("address");
  const village = sp.get("village");
  if (!address) {
    return NextResponse.json(
      { ok: false, error: "address 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  // 클라이언트가 KepcoDataRow 에서 가진 주소/지번 — KEPCO RPC 바로 실행 가능
  const addr = {
    ctp_nm: sp.get("addr_do") || "",
    sig_nm: sp.get("addr_gu") || "",
    emd_nm: sp.get("addr_dong") || "",
    li_nm: sp.get("addr_li") || "",
    jibun: sp.get("addr_jibun") || "",
  };
  const hasAddr =
    !!addr.ctp_nm && !!addr.sig_nm && !!addr.emd_nm && !!addr.jibun;

  // VWorld: KV 우선, 미스 시 API
  const vworldPromise = (async () => {
    const cached = await getCachedParcel(address);
    if (cached) return { parcel: cached, fromCache: true };
    const fresh = await getParcelByAddress(address);
    if (fresh) await setCachedParcel(address, village, fresh);
    return { parcel: fresh, fromCache: false };
  })();

  // KEPCO: 주소 정보가 있으면 VWorld 기다리지 않고 바로 RPC
  const kepcoPromise = hasAddr
    ? fetchKepcoCapa({
        pnu: "",
        jibun: addr.jibun,
        isSan: addr.jibun.startsWith("산"),
        ctp_nm: addr.ctp_nm,
        sig_nm: addr.sig_nm,
        emd_nm: addr.emd_nm,
        li_nm: addr.li_nm,
        addr: "",
      })
    : null;

  const [vworldResult, preKepco] = await Promise.all([
    vworldPromise,
    kepcoPromise,
  ]);
  const { parcel, fromCache } = vworldResult;

  // VWorld 가 필지정보를 줬으나 주소 파라미터가 없어 사전 KEPCO 못 돌린 경우
  // → VWorld jibun 으로 뒤늦게 KEPCO 호출 (하위 호환)
  let capa = preKepco;
  if (!capa && parcel) {
    capa = await fetchKepcoCapa(parcel.jibun);
  }

  if (!parcel) {
    return NextResponse.json({
      ok: true,
      jibun: null,
      geometry: null,
      capa: capa?.rows ?? [],
      matchMode: capa?.matchMode ?? null,
      nearestJibun: capa?.nearestJibun ?? null,
      cached: fromCache,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      jibun: parcel.jibun,
      geometry: parcel.geometry,
      capa: capa?.rows ?? [],
      matchMode: capa?.matchMode ?? null,
      nearestJibun: capa?.nearestJibun ?? null,
      warning: capa?.warning,
      cached: fromCache,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
