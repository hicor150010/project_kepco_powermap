/** localStorage 보조 캐시 (Vercel KV가 1차 캐시) */
const CACHE_KEY = "kepco_geocache_v2";
const BATCH_SIZE = 50; // 한 번에 50개씩 서버로 전송

interface GeoResult {
  lat: number | null;
  lng: number | null;
}

function loadLocalCache(): Record<string, GeoResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalCache(cache: Record<string, GeoResult>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 용량 초과 무시
  }
}

/** 서버에 배치로 주소 변환 요청 */
async function fetchBatch(
  addresses: string[]
): Promise<Record<string, GeoResult>> {
  try {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.results || {};
  } catch {
    return {};
  }
}

/**
 * 주소 배열을 좌표로 변환 (배치 처리)
 * - 1차: 브라우저 localStorage 캐시
 * - 2차: 서버(Vercel KV) + 카카오 API
 */
export async function batchGeocode(
  addresses: string[],
  onProgress?: (ratio: number) => void
): Promise<Record<string, { lat: number; lng: number }>> {
  const localCache = loadLocalCache();
  const results: Record<string, { lat: number; lng: number }> = {};
  const toFetch: string[] = [];

  // 1차: 로컬 캐시 조회
  for (const addr of addresses) {
    const cached = localCache[addr];
    if (cached && cached.lat !== null && cached.lng !== null) {
      results[addr] = { lat: cached.lat, lng: cached.lng };
    } else {
      toFetch.push(addr);
    }
  }

  const total = addresses.length;
  let done = total - toFetch.length;
  onProgress?.(done / total);

  // 2차: 서버에 배치 요청 (50개씩)
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const fetched = await fetchBatch(batch);

    for (const addr of batch) {
      const result = fetched[addr];
      if (result) {
        localCache[addr] = result;
        if (result.lat !== null && result.lng !== null) {
          results[addr] = { lat: result.lat, lng: result.lng };
        }
      }
      done++;
    }
    onProgress?.(done / total);
  }

  saveLocalCache(localCache);
  return results;
}
