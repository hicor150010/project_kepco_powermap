/**
 * VWorld 지오코딩 (서버 전용)
 * - 도로명(road) → 지번(parcel) 순서로 시도
 * - 실패 카운트는 호출자가 집계
 */

const VWORLD_KEY = process.env.VWORLD_KEY || "";

export interface GeocodeResult {
  lat: number;
  lng: number;
}

/** 단일 주소 지오코딩 */
export async function geocodeWithVWorld(
  address: string
): Promise<GeocodeResult | null> {
  if (!VWORLD_KEY) {
    console.error("[VWorld] VWORLD_KEY 미설정");
    return null;
  }
  if (!address || !address.trim()) return null;

  // 도로명 → 지번 순서로 시도
  for (const type of ["road", "parcel"] as const) {
    try {
      const url =
        `https://api.vworld.kr/req/address?service=address&request=getCoord` +
        `&version=2.0&crs=EPSG:4326&format=json&type=${type}` +
        `&address=${encodeURIComponent(address)}&key=${VWORLD_KEY}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.response?.status !== "OK") continue;
      const point = data.response.result?.point;
      if (!point) continue;
      const lat = parseFloat(point.y);
      const lng = parseFloat(point.x);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    } catch (err) {
      console.error(`[VWorld 호출 실패] type=${type} addr="${address}":`, err);
    }
  }
  return null;
}

/** 병렬 지오코딩 (5개씩 청크) */
export async function geocodeBatch(
  addresses: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, GeocodeResult | null>> {
  const PARALLEL = 5;
  const results = new Map<string, GeocodeResult | null>();
  let done = 0;

  for (let i = 0; i < addresses.length; i += PARALLEL) {
    const chunk = addresses.slice(i, i + PARALLEL);
    const fetched = await Promise.all(
      chunk.map((addr) => geocodeWithVWorld(addr))
    );
    chunk.forEach((addr, idx) => results.set(addr, fetched[idx]));
    done += chunk.length;
    onProgress?.(done, addresses.length);
  }

  return results;
}
