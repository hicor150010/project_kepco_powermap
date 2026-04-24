/**
 * VWorld WFS 행정구역 폴리곤 조회 (리 / 읍면동).
 *
 * 레이어:
 *   - lt_c_adri  — 리 경계 (li_cd = bjd_code 10자리)
 *   - lt_c_ademd — 읍면동 경계 (emd_cd = bjd_code 앞 8자리)
 *
 * 분기 규칙 (행안부 법정동코드 표준):
 *   bjd_code = 시도(2) + 시군구(3) + 읍면동(3) + 리(2)
 *   끝 2자리 == "00"  → 리 없음 (도시지역 동) → lt_c_ademd 로 조회
 *   끝 2자리 != "00"  → 리 단위 → lt_c_adri 로 조회
 *
 * 분리 폴리곤(섬 등) 케이스: features[] 가 여러 개 → 모든 외곽링을 합쳐 polygon[] 으로.
 * center 는 면적이 가장 큰 feature 의 centroid (라벨 위치 안정성).
 */
import area from "@turf/area";
import centroid from "@turf/centroid";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

const VWORLD_KEY = process.env.VWORLD_KEY || "";
const WFS_URL = "https://api.vworld.kr/req/wfs";
const TIMEOUT_MS = 5000;

export type AdminLevel = "ri" | "emd";

export interface AdminPolygonResult {
  bjd_code: string;
  level: AdminLevel;
  /** "강원특별자치도 고성군 간성읍 광산리" 형태 */
  full_nm: string;
  /** MultiPolygon 외곽링들 */
  polygon: Position[][];
  /** 가장 큰 폴리곤 중심 좌표 */
  center: { lat: number; lng: number };
}

interface AdminFeature {
  geometry: Polygon | MultiPolygon;
  properties: { full_nm?: string; li_kor_nm?: string; emd_kor_nm?: string };
}

interface WfsResponse {
  features?: AdminFeature[];
}

export async function getAdminPolygonByBjd(
  bjdCode: string
): Promise<AdminPolygonResult | null> {
  if (!VWORLD_KEY) {
    console.error("[VWorld Admin] VWORLD_KEY 미설정");
    return null;
  }
  const cleaned = (bjdCode || "").trim();
  if (!/^\d{10}$/.test(cleaned)) return null;

  const isEmd = cleaned.endsWith("00");
  const layer = isEmd ? "lt_c_ademd" : "lt_c_adri";
  const field = isEmd ? "emd_cd" : "li_cd";
  const value = isEmd ? cleaned.slice(0, 8) : cleaned;

  const filter =
    `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0">` +
    `<fes:PropertyIsEqualTo>` +
    `<fes:ValueReference>${field}</fes:ValueReference>` +
    `<fes:Literal>${value}</fes:Literal>` +
    `</fes:PropertyIsEqualTo>` +
    `</fes:Filter>`;

  const params = new URLSearchParams({
    key: VWORLD_KEY,
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typename: layer,
    output: "application/json",
    srsName: "EPSG:4326",
    FILTER: filter,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${WFS_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Referer: "https://sublab.kr" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error(`[VWorld Admin] HTTP ${res.status} (${cleaned})`);
      return null;
    }
    const data = (await res.json()) as WfsResponse;
    const features = data.features ?? [];
    if (features.length === 0) return null;

    const allRings: Position[][] = [];
    for (const f of features) {
      if (f.geometry.type === "Polygon") {
        allRings.push(f.geometry.coordinates[0]);
      } else {
        for (const poly of f.geometry.coordinates) allRings.push(poly[0]);
      }
    }

    let largest = features[0];
    let largestArea = area(
      largest as unknown as Feature<Polygon | MultiPolygon>
    );
    for (const f of features.slice(1)) {
      const a = area(f as unknown as Feature<Polygon | MultiPolygon>);
      if (a > largestArea) {
        largest = f;
        largestArea = a;
      }
    }
    const c = centroid(largest as unknown as Feature<Polygon | MultiPolygon>);
    const [lng, lat] = c.geometry.coordinates;

    return {
      bjd_code: cleaned,
      level: isEmd ? "emd" : "ri",
      full_nm: features[0].properties.full_nm ?? "",
      polygon: allRings,
      center: { lat, lng },
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.error(`[VWorld Admin] 타임아웃 ${TIMEOUT_MS}ms (${cleaned})`);
    } else {
      console.error(`[VWorld Admin] 호출 실패 (${cleaned}):`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
