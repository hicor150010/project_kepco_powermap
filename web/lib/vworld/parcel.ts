/**
 * VWorld WFS 필지 정보 조회 래퍼.
 *
 * 좌표 → 해당 필지의 폴리곤 + 지번/지목/주소/면적 반환.
 *
 * 엔드포인트: https://api.vworld.kr/req/wfs
 * 레이어: lp_pa_cbnd_bubun (연속지적 필지 경계)
 *
 * 설계 원칙:
 *  - "지번" 이 모든 정보의 출발점. 진입이 좌표든 직접 지번이든 동일 구조로 수렴.
 *  - VWorld 응답의 `bonbun`/`bubun`/`bchk` 필드를 직접 사용 (문자열 파싱 금지).
 *    `jibun` 필드("159-2대")는 지목 추출용으로만 사용.
 *  - 면적은 응답에 없어 Turf.js 로 폴리곤에서 계산.
 *
 * 미래 확장: 지번 직접 입력으로 필지 조회하는 경우 → `getParcelByPoint` 대신
 *            좌표 변환 후 재호출 (지오코더 재활용).
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

// ───────────────────────────────────────────
// 타입 — 정보 단위로 분리
// ───────────────────────────────────────────

/**
 * 지번 정보 (DB 쿼리에 필요한 키 세트).
 * 좌표 진입 / 지번 직접 진입 모두 같은 구조로 수렴.
 */
export interface JibunInfo {
  /** 필지 고유번호 (19자리) */
  pnu: string;
  /** 지번 번호 (예: "148-11", "159-2", "산 23-4") */
  jibun: string;
  /** 산 지번 여부 */
  isSan: boolean;
  /** 시도 (예: "서울특별시") */
  ctp_nm: string;
  /** 시군구 (예: "강남구") */
  sig_nm: string;
  /** 읍면동 (예: "삼성동") */
  emd_nm: string;
  /** 리 (없을 수 있음) */
  li_nm: string;
  /** 전체 주소 문자열 */
  addr: string;
}

/**
 * 필지 형상/속성 정보 (VWorld 에서만 얻을 수 있는 부가 데이터).
 * DB(KEPCO) 여유용량과는 별개.
 */
export interface ParcelGeometry {
  /** 지목 (예: "대", "전", "답", "임야") */
  jimok: string;
  /** 면적 (㎡) — Turf.js 계산값 */
  area_m2: number;
  /** 공시지가 (원/㎡) — 보너스 */
  jiga: number | null;
  /** 필지 폴리곤 좌표 (MultiPolygon 지원, [[[lng,lat],...],...]) */
  polygon: Position[][];
}

/** 통합 응답 (좌표 진입 시 한 번에 다 받음) */
export interface ParcelResult {
  jibun: JibunInfo;
  geometry: ParcelGeometry;
}

// ───────────────────────────────────────────
// WFS 응답 스키마
// ───────────────────────────────────────────

interface WfsProperties {
  pnu: string;
  /** "148-11 대" 형태 — 지목 추출용으로만 사용 */
  jibun: string;
  /** 본번 (숫자 문자열, 예: "148") */
  bonbun: string;
  /** 부번 (숫자 문자열, "0" = 부번 없음) */
  bubun: string;
  /** 대지구분 ("1"=일반, "2"=산) */
  bchk: string;
  addr: string;
  ctp_nm: string;
  sig_nm: string;
  emd_nm: string;
  li_nm: string;
  jiga: string;
}

interface WfsFeature {
  type: "Feature";
  geometry: Polygon | MultiPolygon;
  properties: WfsProperties;
}

interface WfsResponse {
  type: "FeatureCollection";
  features: WfsFeature[];
}

// ───────────────────────────────────────────
// 순수 함수 — 테스트 대상 (export 해서 단위 테스트)
// ───────────────────────────────────────────

/**
 * bonbun/bubun/bchk 필드에서 지번 번호 조립.
 *
 * 규칙:
 *  - bubun="0" 이면 부번 생략 → "본번"
 *  - 그 외 → "본번-부번"
 *  - bchk="2" (산 지번) → "산 " 접두어
 */
export function buildJibunNumber(
  bonbun: string,
  bubun: string,
  bchk: string,
): string {
  // VWorld 가 부번에 지목을 섞어 보내는 케이스 있음 (예: bubun="5도" — 지목=도로 필지).
  // 숫자만 추출해서 안전하게 조합.
  const b = (bonbun || "").match(/\d+/)?.[0] ?? "";
  const s = (bubun || "").match(/\d+/)?.[0] ?? "";
  const num = !s || s === "0" ? b : `${b}-${s}`;
  // KEPCO DB 는 산 지번을 공백 없이 저장 (예: "산1-1", "산23"). 포맷 일치 필수.
  const isSan = bchk === "2";
  const raw = isSan ? `산${num}` : num;
  return normalizeJibun(raw);
}

/**
 * 지번 canonical form — DB 매칭 키로 쓰기 위한 정규화.
 *
 * 규칙:
 *   1. 모든 공백 제거 ("산 1-1" → "산1-1")
 *   2. 끝에 붙은 한글(지목/번지 접미사) 제거 ("189-5도" → "189-5", "42번지" → "42")
 *
 * KEPCO 전수 검증 결과 (2026-04-21): 저장 포맷이 `^(산)?\d+(-\d+)?$` 로 단일.
 * 이 정규화를 통과하면 KEPCO 포맷과 항상 일치. 미래 VWorld 포맷 변경에도
 * 이 함수만 유지하면 방어 가능.
 */
export function normalizeJibun(value: string): string {
  return (value || "")
    .replace(/\s+/g, "") // 모든 공백 제거
    .replace(/[가-힣]+$/, ""); // 끝에 붙은 한글 제거
}

/**
 * jibun 문자열에서 지목만 추출 (끝에 붙은 한글).
 *
 * "148-11 대"   → "대"
 * "159-2대"    → "대"
 * "산 23-4 임" → "임"
 * "42잡종지"    → "잡종지"
 * "159"        → ""  (지목 없음)
 */
export function parseJimok(jibunStr: string): string {
  if (!jibunStr) return "";
  const m = jibunStr.match(/([가-힣]{1,4})\s*$/);
  return m ? m[1] : "";
}

/** 지번 번호에서 산 지번 판별 (fallback) */
function isSanJibun(bchk: string): boolean {
  return bchk === "2";
}

// ───────────────────────────────────────────
// 메인: 좌표 → 필지 정보
// ───────────────────────────────────────────

/**
 * 좌표에 속한 필지 정보 조회. 없으면 null.
 *
 * 처리 흐름:
 *   1. 좌표 주변 작은 BBOX (±5m) 로 WFS 호출
 *   2. 응답 필지들 중 point-in-polygon 으로 실제 포함 필지 선별
 *   3. JibunInfo + ParcelGeometry 로 분리해 반환
 */
export async function getParcelByPoint(
  lat: number,
  lng: number,
): Promise<ParcelResult | null> {
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

    // 해당 좌표가 실제로 포함되는 필지 선별 (BBOX 는 느슨, 정확 매칭은 클라이언트)
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

    return splitParcelFeature(match);
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

/**
 * WFS Feature → JibunInfo + ParcelGeometry 로 분리.
 * 모든 파싱/계산 로직은 순수 함수(`buildJibunNumber`, `parseJimok`) 에 위임.
 */
export function splitParcelFeature(feature: WfsFeature): ParcelResult {
  const p = feature.properties;

  const jibunNumber = buildJibunNumber(p.bonbun, p.bubun, p.bchk);
  const jimok = parseJimok(p.jibun);
  const isSan = isSanJibun(p.bchk);

  const jiga = p.jiga ? parseInt(p.jiga, 10) : null;
  const area_m2 = Math.round(
    area(feature as unknown as Feature<Polygon | MultiPolygon>),
  );
  const polygon = extractPolygonCoords(feature.geometry);

  const jibun: JibunInfo = {
    pnu: p.pnu,
    jibun: jibunNumber,
    isSan,
    ctp_nm: p.ctp_nm,
    sig_nm: p.sig_nm,
    emd_nm: p.emd_nm,
    li_nm: p.li_nm || "",
    addr: p.addr,
  };
  const geometry: ParcelGeometry = {
    jimok,
    area_m2,
    jiga,
    polygon,
  };
  return { jibun, geometry };
}

/**
 * Polygon/MultiPolygon → 외곽 링 좌표 배열들.
 * MultiPolygon 이면 여러 개 (카카오 Polygon 도 path 배열 지원).
 */
function extractPolygonCoords(geom: Polygon | MultiPolygon): Position[][] {
  if (geom.type === "Polygon") {
    return [geom.coordinates[0]];
  }
  return geom.coordinates.map((poly) => poly[0]);
}

// GeoJSON Point 타입 (의존성 최소화 위해 local)
interface Point {
  type: "Point";
  coordinates: Position;
}
