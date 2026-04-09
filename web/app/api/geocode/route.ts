import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY || "";
const VWORLD_KEY = process.env.VWORLD_KEY || "";
const KV_PREFIX = "geo:";

// KV 사용 가능 여부 (로컬 개발 시 환경변수 없으면 fallback)
const KV_ENABLED = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

interface GeoResult {
  lat: number | null;
  lng: number | null;
}

/** KV에서 단일 주소 조회 */
async function getCached(address: string): Promise<GeoResult | null> {
  if (!KV_ENABLED) return null;
  try {
    const cached = await kv.get<GeoResult>(KV_PREFIX + address);
    return cached || null;
  } catch {
    return null;
  }
}

/** KV에 단일 주소 저장 */
async function setCached(address: string, result: GeoResult): Promise<void> {
  if (!KV_ENABLED) return;
  try {
    await kv.set(KV_PREFIX + address, result);
  } catch {
    // 저장 실패 무시
  }
}

/** 카카오 지오코딩 API 호출 결과 */
interface KakaoResult extends GeoResult {
  /** 한도 초과/차단 등 일시 장애 (fallback 트리거) */
  quotaError?: boolean;
}

/** 카카오 지오코딩 API 호출 (메인) */
async function callKakao(address: string): Promise<KakaoResult> {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      // 429: rate limit, 401/403: auth, 일 한도 초과는 보통 401/429
      const isQuota = res.status === 429 || res.status === 401 || res.status === 403;
      if (isQuota) {
        console.warn(`[카카오 한도/차단] ${res.status}: ${errText}`);
      } else {
        console.error(`[카카오 API 오류] ${res.status}: ${errText} (주소: ${address})`);
      }
      return { lat: null, lng: null, quotaError: isQuota };
    }

    const data = await res.json();
    const documents = data.documents || [];
    if (documents.length === 0) {
      // 결과 없음 — 카카오가 못 찾는 주소일 수 있으니 fallback 시도 가능하게 표시
      return { lat: null, lng: null };
    }

    const first = documents[0];
    return { lat: parseFloat(first.y), lng: parseFloat(first.x) };
  } catch (err) {
    console.error(`[카카오 호출 실패] ${address}: ${err}`);
    return { lat: null, lng: null, quotaError: true };
  }
}

/** VWorld 지오코딩 API 호출 (fallback) */
async function callVWorld(address: string): Promise<GeoResult> {
  if (!VWORLD_KEY) return { lat: null, lng: null };
  // 도로명 우선 → 실패 시 지번
  for (const type of ["road", "parcel"] as const) {
    try {
      const url =
        `https://api.vworld.kr/req/address?service=address&request=getCoord` +
        `&version=2.0&crs=EPSG:4326&format=json&type=${type}` +
        `&address=${encodeURIComponent(address)}&key=${VWORLD_KEY}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.response?.status !== "OK") continue;
      const point = data.response.result?.point;
      if (!point) continue;
      const lat = parseFloat(point.y);
      const lng = parseFloat(point.x);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    } catch (err) {
      console.error(`[VWorld 호출 실패] ${address}: ${err}`);
    }
  }
  return { lat: null, lng: null };
}

/** 메인 + fallback 조합: 카카오 → 실패 시 VWorld */
async function geocode(address: string): Promise<GeoResult> {
  const kakao = await callKakao(address);
  if (kakao.lat !== null) return { lat: kakao.lat, lng: kakao.lng };

  // 카카오가 결과를 못 줬으면 VWorld 시도 (한도 초과/결과 없음 모두)
  const vworld = await callVWorld(address);
  if (vworld.lat !== null) {
    console.log(`[VWorld fallback 성공] ${address}`);
    return vworld;
  }
  console.warn(`[지오코딩 실패] ${address}`);
  return { lat: null, lng: null };
}

/** 단일 주소 (GET) — 호환성 유지용 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address 파라미터 필요" }, { status: 400 });
  }
  if (!KAKAO_REST_KEY) {
    return NextResponse.json({ error: "KAKAO_REST_KEY 미설정" }, { status: 500 });
  }

  // 캐시 조회
  const cached = await getCached(address);
  if (cached) return NextResponse.json(cached);

  // 카카오 메인 + VWorld fallback
  const result = await geocode(address);
  if (result.lat !== null) {
    await setCached(address, result);
  }
  return NextResponse.json(result);
}

/** 배치 주소 변환 (POST) */
export async function POST(request: NextRequest) {
  if (!KAKAO_REST_KEY) {
    return NextResponse.json({ error: "KAKAO_REST_KEY 미설정" }, { status: 500 });
  }

  let addresses: string[];
  try {
    const body = await request.json();
    addresses = body.addresses;
    if (!Array.isArray(addresses)) {
      return NextResponse.json({ error: "addresses 배열 필요" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const results: Record<string, GeoResult> = {};

  // 1단계: KV 캐시 일괄 조회
  if (KV_ENABLED && addresses.length > 0) {
    try {
      const keys = addresses.map((a) => KV_PREFIX + a);
      const cached = await kv.mget<GeoResult[]>(...keys);
      addresses.forEach((addr, i) => {
        if (cached[i]) results[addr] = cached[i];
      });
    } catch {
      // 조회 실패 무시
    }
  }

  // 2단계: 캐시 미스만 지오코딩 (카카오 메인 + VWorld fallback, 5개씩 병렬)
  const toFetch = addresses.filter((a) => !results[a]);
  const PARALLEL = 5;
  for (let i = 0; i < toFetch.length; i += PARALLEL) {
    const chunk = toFetch.slice(i, i + PARALLEL);
    const fetched = await Promise.all(chunk.map((addr) => geocode(addr)));
    await Promise.all(
      chunk.map(async (addr, idx) => {
        const result = fetched[idx];
        results[addr] = result;
        if (result.lat !== null) {
          await setCached(addr, result);
        }
      })
    );
  }

  return NextResponse.json({
    results,
    total: addresses.length,
    cached: addresses.length - toFetch.length,
    fetched: toFetch.length,
  });
}
