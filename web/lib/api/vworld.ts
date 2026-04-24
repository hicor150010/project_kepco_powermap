/**
 * Client-side fetch wrappers — VWorld 필지/행정구역 atomic endpoints.
 *
 * 컴포넌트는 이 파일의 함수만 호출. 서버 lib (lib/vworld/parcel.ts, admin-polygon.ts) 는
 * route.ts 가 직접 사용하는 server-only — 여기서는 type 만 import.
 *
 * Endpoint ↔ 함수 매핑:
 *   /api/parcel/by-pnu     ↔ fetchVworldParcelByPnu
 *   /api/parcel/by-latlng  ↔ fetchVworldParcelByLatLng
 *   /api/polygon/by-bjd    ↔ fetchVworldAdminPolygonByBjdCode
 */
import type { JibunInfo, ParcelGeometry } from "@/lib/vworld/parcel";
import type { AdminPolygonResult } from "@/lib/vworld/admin-polygon";

export interface ParcelLookupResult {
  jibun: JibunInfo;
  geometry: ParcelGeometry;
}

interface ParcelApiResponse {
  ok: boolean;
  pnu?: string;
  lat?: number;
  lng?: number;
  jibun?: JibunInfo | null;
  geometry?: ParcelGeometry | null;
  error?: string;
}

interface PolygonApiResponse {
  ok: boolean;
  bjd_code?: string;
  level?: "ri" | "emd" | null;
  full_nm?: string | null;
  polygon?: AdminPolygonResult["polygon"] | null;
  center?: { lat: number; lng: number } | null;
  error?: string;
}

/** /api/parcel/by-pnu — PNU 19자리 → 필지 폴리곤 + 주소/지목/면적/공시지가 (실측 ~40ms) */
export async function fetchVworldParcelByPnu(
  pnu: string,
): Promise<ParcelLookupResult | null> {
  const res = await fetch(`/api/parcel/by-pnu?pnu=${encodeURIComponent(pnu)}`);
  const data = (await res.json()) as ParcelApiResponse;
  if (!data.ok) throw new Error(data.error || "필지(PNU) 조회 실패");
  if (!data.jibun || !data.geometry) return null;
  return { jibun: data.jibun, geometry: data.geometry };
}

/** /api/parcel/by-latlng — 좌표 → 필지 (BBOX + point-in-polygon). 바다/미등록은 null. */
export async function fetchVworldParcelByLatLng(
  lat: number,
  lng: number,
): Promise<ParcelLookupResult | null> {
  const res = await fetch(`/api/parcel/by-latlng?lat=${lat}&lng=${lng}`);
  const data = (await res.json()) as ParcelApiResponse;
  if (!data.ok) throw new Error(data.error || "필지(좌표) 조회 실패");
  if (!data.jibun || !data.geometry) return null;
  return { jibun: data.jibun, geometry: data.geometry };
}

/** /api/polygon/by-bjd — 행정구역 폴리곤 (리/읍면동 자동 분기). 미등록 bjd 는 null. */
export async function fetchVworldAdminPolygonByBjdCode(
  bjdCode: string,
): Promise<AdminPolygonResult | null> {
  const res = await fetch(
    `/api/polygon/by-bjd?bjd_code=${encodeURIComponent(bjdCode)}`,
  );
  const data = (await res.json()) as PolygonApiResponse;
  if (!data.ok) throw new Error(data.error || "행정구역 폴리곤 조회 실패");
  if (!data.level || !data.polygon || !data.center) return null;
  return {
    bjd_code: bjdCode,
    level: data.level,
    full_nm: data.full_nm ?? "",
    polygon: data.polygon,
    center: data.center,
  };
}
