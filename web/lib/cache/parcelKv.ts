/**
 * 지번 단위 필지정보 KV 캐시.
 *
 * 정책:
 *   - 지번 단위 좌표는 DB 에 저장하지 않음 (Vercel KV TTL 3일 전용).
 *   - 리 단위 좌표는 kepco_addr.lat/lng 에 저장.
 *
 * 키 설계:
 *   parcel:{전체주소}   — 단건 (ParcelResult JSON)
 *   parcel:v:{마을주소} — 마을 Set (해당 마을에 캐시된 전체주소 모음)
 *
 * 마을 Set 은 /api/geocode-cached (마을 prefix 로 지번 좌표 나열) 재구현용.
 * KV 미설정(로컬 개발) 시 모든 함수 no-op.
 */

import { kv } from "@vercel/kv";
import type { ParcelResult } from "@/lib/vworld/parcel";

const KEY_PARCEL = "parcel:";
const KEY_VILLAGE = "parcel:v:";
const TTL_SECONDS = 60 * 60 * 24 * 3; // 3일

const KV_ENABLED =
  !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

export interface CachedParcelPin {
  jibun: string;
  lat: number;
  lng: number;
}

/** 단건 조회 — 없으면 null */
export async function getCachedParcel(
  address: string,
): Promise<ParcelResult | null> {
  if (!KV_ENABLED) return null;
  try {
    return (await kv.get<ParcelResult>(KEY_PARCEL + address)) ?? null;
  } catch {
    return null;
  }
}

/** 단건 저장 + 마을 Set 에 멤버 추가. village 가 없으면 단건만 저장. */
export async function setCachedParcel(
  address: string,
  village: string | null,
  result: ParcelResult,
): Promise<void> {
  if (!KV_ENABLED) return;
  try {
    await kv.set(KEY_PARCEL + address, result, { ex: TTL_SECONDS });
    if (village) {
      await kv.sadd(KEY_VILLAGE + village, address);
      // Set 자체에도 TTL (3일). 마지막 멤버 추가 시점부터 재연장.
      await kv.expire(KEY_VILLAGE + village, TTL_SECONDS);
    }
  } catch {
    // 저장 실패 무시 — 조회 성능 영향만 있음
  }
}

/**
 * 마을 prefix 로 캐시된 지번 좌표 일괄 조회.
 * /api/geocode-cached 재구현용 (마을 진입 시 핀 복원).
 *
 * 구현: 마을 Set 조회 → 멤버 주소들 mget → 좌표만 추출
 */
export async function getCachedVillagePins(
  village: string,
): Promise<CachedParcelPin[]> {
  if (!KV_ENABLED) return [];
  try {
    const members = await kv.smembers(KEY_VILLAGE + village);
    if (!members || members.length === 0) return [];

    const keys = members.map((addr) => KEY_PARCEL + addr);
    const results = await kv.mget<ParcelResult[]>(...keys);

    const pins: CachedParcelPin[] = [];
    const staleMembers: string[] = [];
    results.forEach((r, i) => {
      if (r == null) {
        // 단건 TTL 이 먼저 끊긴 경우 — Set 에서 제거
        staleMembers.push(members[i]);
        return;
      }
      // polygon 중심 대신 첫 좌표 근사 — 핀 위치로는 충분
      const first = r.geometry?.polygon?.[0]?.[0];
      if (!first) return;
      pins.push({
        jibun: r.jibun.jibun,
        lng: first[0],
        lat: first[1],
      });
    });

    if (staleMembers.length > 0) {
      try {
        await kv.srem(KEY_VILLAGE + village, ...staleMembers);
      } catch {
        /* ignore */
      }
    }

    return pins;
  } catch {
    return [];
  }
}
