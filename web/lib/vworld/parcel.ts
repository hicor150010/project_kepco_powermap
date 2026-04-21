/**
 * VWorld WFS 필지 정보 조회 래퍼.
 *
 * 좌표 → 해당 필지의 폴리곤 + 지번/지목/주소/면적 반환.
 *
 * 엔드포인트: https://api.vworld.kr/req/wfs
 * 레이어: lp_pa_cbnd_bubun (연속지적 필지 경계)
 *
 * 특이 사항:
 *  - 응답에 면적 필드 없음 → Turf.js 로 폴리곤에서 계산
 *  - `jibun` 필드는 "148-11 대" 형태 (지번 + 지목 합쳐짐) → split 파싱
 *  - CQL_FILTER INTERSECTS 는 동작 이상 → BBOX + 클라이언트 point-in-polygon 방식 사용
 */

import area from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

const VWORLD_KEY = process.env.VWORLD_KEY || "";
const WFS_URL = "https://api.vworld.kr/req/wfs";
const LAYER = "lp_pa_cbnd_bubun";

/** BBOX 반경 (도 단위). 5m ≈ 0.00005° @ 한국 위도 */
const BBOX_DELTA = 0.00005;

/** WFS fetch timeout (ms) */
const TIMEOUT_MS = 3000;

export interface ParcelInfo {
  /** 필지 고유번호 (19자리) */
  pnu: string;
  /** 지번 (예: "148-11") */
  jibun: string;
  /** 지목 (예: "대", "전", "답", "임야") */
  jimok: string;
  /** 전체 주소 (예: "서울특별시 강남구 삼성동 148-11") */
  addr: string;
  /** 시도 */
  ctp_nm: string;
  /** 시군구 */
  sig_nm: string;
  /** 읍면동 */
  emd_nm: string;
  /** 리 (없을 수 있음) */
  li_nm: string;
  /** 공시지가 (원/㎡) — 보너스 데이터 */
  jiga: number | null;
  /** 면적 (㎡) — Turf.js 계산값 */
  area_m2: number;
  /** 필지 폴리곤 좌표 (GeoJSON Position 배열들) — 지도 하이라이트용 */
  polygon: Position[][];
}

interface WfsFeature {
  type: "Feature";
  geometry: Polygon | MultiPolygon;
  properties: {
    pnu: string;
    jibun: string;
    addr: string;
    ctp_nm: string;
    sig_nm: string;
    emd_nm: string;
    li_nm: string;
    jiga: string;
  };
}

interface WfsResponse {
  type: "FeatureCollection";
  features: WfsFeature[];
}

/**
 * 좌표 → 필지 정보 조회. 해당 좌표가 속한 필지가 없으면 null.
 *
 * 처리 흐름:
 *   1. 좌표 주변 작은 BBOX (±5m) 로 WFS 호출
 *   2. 응답 필지들 중 point-in-polygon 으로 실제 포함 필지 선별
 *   3. 지번/지목 파싱, 면적 계산, 폴리곤 좌표 추출
 */
export async function getParcelByPoint(
  lat: number,
  lng: number,
): Promise<ParcelInfo | null> {
  if (!VWORLD_KEY) {
    console.error("[VWorld Parcel] VWORLD_KEY 미설정");
    return null;
  }

  const bbox = [
    lng - BBOX_DELTA,
    lat - BBOX_DELTA,
    lng + BBOX_DELTA,
    lat + BBOX_DELTA,
  ].join(",");

  const params = new URLSearchParams({
    key: VWORLD_KEY,
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typename: LAYER,
    output: "application/json",
    srsName: "EPSG:4326",
    bbox,
    maxFeatures: "10",
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
      console.error(`[VWorld Parcel] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as WfsResponse;
    if (!data.features?.length) return null;

    // 해당 좌표가 실제로 포함되는 필지 선별
    const clickPoint: Feature<Point> = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [lng, lat] },
    };
    const match = data.features.find((f) => {
      try {
        return booleanPointInPolygon(
          clickPoint,
          f as unknown as Feature<Polygon | MultiPolygon>,
        );
      } catch {
        return false;
      }
    });

    if (!match) return null;

    return parseParcelFeature(match);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.error(`[VWorld Parcel] 타임아웃 ${TIMEOUT_MS}ms`);
    } else {
      console.error(`[VWorld Parcel] 호출 실패:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** WFS Feature → ParcelInfo 변환. 지번/지목 분리, 면적 계산, 폴리곤 좌표 추출. */
function parseParcelFeature(feature: WfsFeature): ParcelInfo {
  const p = feature.properties;

  // "148-11 대" → jibun="148-11", jimok="대"
  // "산 23-4 임" 같은 변형도 고려 (마지막 토큰이 지목)
  const jibunParts = p.jibun.trim().split(/\s+/);
  const jimok = jibunParts[jibunParts.length - 1] || "";
  const jibun = jibunParts.slice(0, -1).join(" ") || "";

  const jiga = p.jiga ? parseInt(p.jiga, 10) : null;

  // 면적 계산 (Turf.js — WGS84 기준 m²)
  const area_m2 = Math.round(
    area(feature as unknown as Feature<Polygon | MultiPolygon>),
  );

  // 폴리곤 좌표 추출 (MultiPolygon 이든 Polygon 이든 [][] 형태로)
  const polygon = extractPolygonCoords(feature.geometry);

  return {
    pnu: p.pnu,
    jibun,
    jimok,
    addr: p.addr,
    ctp_nm: p.ctp_nm,
    sig_nm: p.sig_nm,
    emd_nm: p.emd_nm,
    li_nm: p.li_nm || "",
    jiga,
    area_m2,
    polygon,
  };
}

/**
 * Polygon/MultiPolygon → 외곽 링 좌표 배열들.
 * MultiPolygon 이면 여러 개 (카카오 Polygon 도 path 배열 지원).
 */
function extractPolygonCoords(
  geom: Polygon | MultiPolygon,
): Position[][] {
  if (geom.type === "Polygon") {
    // 외곽 링만 사용 (구멍 무시 — 지적 필지는 구멍 거의 없음)
    return [geom.coordinates[0]];
  }
  // MultiPolygon: 각 폴리곤의 외곽 링만 취함
  return geom.coordinates.map((poly) => poly[0]);
}

// GeoJSON Point 타입 (import 누락 방지)
interface Point {
  type: "Point";
  coordinates: Position;
}
