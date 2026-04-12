"use client";

import { useEffect, useRef, useState } from "react";
import type { MapSummaryRow, MarkerColor } from "@/lib/types";
import type { CompareRefRow } from "@/app/api/compare/route";
import {
  colorForMarker,
  ratiosForMarker,
  STATUS_RED,
  STATUS_BLUE,
  type MarkerRatios,
} from "@/lib/markerColor";

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "";

declare global {
  interface Window {
    kakao: any;
  }
}

interface Props {
  rows: MapSummaryRow[];
  /** 현재 활성화된 색상 필터 */
  colorFilter: Set<MarkerColor>;
  /** 마커 클릭 콜백 */
  onMarkerClick: (row: MapSummaryRow) => void;
  /** 데이터 변경 시 fitBounds용 키 */
  fitBoundsKey: number;
  /** 지도 인스턴스 준비 완료 시 호출 (편의 도구가 사용) */
  onMapReady?: (map: any) => void;
  /** 거리재기 등 특수 모드: true면 마커 클릭을 무시하고 커서를 crosshair로 바꾼다 */
  measureMode?: boolean;
  /**
   * 측정 모드일 때 마커 클릭으로 점을 추가할 함수가 담긴 ref.
   * onMarkerClick(상세보기)과는 분리해서 직접 호출 — closure 꼬임 방지.
   */
  measureAddPointRef?: React.MutableRefObject<((latlng: any) => void) | null>;
  /** 현재 선택된 마을의 geocode_address — halo 표시 */
  selectedAddr?: string | null;
  /** 지도 타입: "roadmap" | "skyview" | "hybrid" */
  mapType?: "roadmap" | "skyview" | "hybrid";
  /** 비교 결과 — 값이 있으면 변경 마커 오버레이 표시 */
  compareRows?: CompareRefRow[];
}

/**
 * 새 마커 SVG — 3시설 병렬 + 정량 비율 표시.
 *
 * 각 줄은 가로 막대로, 빨강 길이가 "부족 비율(%)"을 의미한다.
 * 사용자는 한 마커만 봐도 시설별로 얼마나 부족한지 직관적으로 인지.
 *
 *   ┌─────────┐
 *   │██████▓▓│  ← 변전소  75% 부족
 *   │▓▓▓▓▓▓▓▓│  ← 주변압기 모두 여유
 *   │███▓▓▓▓▓│  ← 배전선로 38% 부족
 *   └────┬────┘
 *        ▼
 */
/** 고해상도(Retina) 디스플레이에서 선명하게 렌더링하기 위한 스케일 */
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 1;

/**
 * SVG data-URI → Canvas(DPR 해상도) → PNG data-URI 변환.
 * 카카오맵 SDK가 MarkerImage를 CSS 픽셀 크기로 래스터화하기 때문에
 * 미리 고해상도 비트맵(PNG)으로 변환해 전달해야 레티나 디스플레이에서 선명하다.
 */
const _pngCache = new Map<string, string>();

function svgToPng(
  svgDataUri: string,
  logicalW: number,
  logicalH: number,
): Promise<string> {
  if (_pngCache.has(svgDataUri)) return Promise.resolve(_pngCache.get(svgDataUri)!);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(logicalW * DPR);
      canvas.height = Math.round(logicalH * DPR);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL("image/png");
      _pngCache.set(svgDataUri, png);
      resolve(png);
    };
    img.onerror = () => resolve(svgDataUri); // fallback: SVG 그대로
    img.src = svgDataUri;
  });
}

function makeMarkerSvg(
  ratios: MarkerRatios,
  count: number,
  selected: boolean = false
): string {
  const cardW = 28;
  const cardH = 30;
  const arrowH = 8;
  const totalH = cardH + arrowH;

  // 선택 상태: 주황 테두리 + 드롭섀도, 일반: 얇은 회색 테두리
  const outlineColor = selected ? "#f97316" : "rgba(0,0,0,0.35)";
  const outlineWidth = selected ? 2.5 : 1;

  const showBadge = count > 1;
  const badgeText = count > 9999 ? "9999+" : String(count);
  const badgeWidth = badgeText.length <= 2 ? 18 : badgeText.length === 3 ? 22 : badgeText.length === 4 ? 28 : 34;
  const badgeH = 14;
  const badgeGap = 2; // 카드와 배지 사이 간격
  // 배지는 카드 우측 옆에 분리해 둬서 줄 위에 안 겹치게
  const w = showBadge ? cardW + badgeGap + badgeWidth : cardW;

  // 배지 위치 — 카드 옆, 세로 중앙
  const badgeX = cardW + badgeGap;
  const badgeY = (cardH - badgeH) / 2;

  const badge = showBadge
    ? `<rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeH}" rx="7" ry="7"
         fill="#1f2937" stroke="white" stroke-width="1.5"/>
       <text x="${badgeX + badgeWidth / 2}" y="${badgeY + 10}" text-anchor="middle"
         font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="white">${badgeText}</text>`
    : "";

  // 줄 3개의 y/x 좌표
  const stripeH = 6;
  const gap = 2;
  const startY = 4;
  const stripeX = 3;
  const stripeW = cardW - 6;

  /** 한 줄 그리기: 파란 배경(여유) + 빨간 오버레이(부족 비율 길이) */
  const stripe = (y: number, noPct: number): string => {
    const clampedNo = Math.max(0, Math.min(100, noPct));
    const redW = (stripeW * clampedNo) / 100;
    return `
      <rect x="${stripeX}" y="${y}" width="${stripeW}" height="${stripeH}" rx="1" fill="${STATUS_BLUE}"/>
      ${
        redW > 0
          ? `<rect x="${stripeX}" y="${y}" width="${redW.toFixed(2)}" height="${stripeH}" rx="1" fill="${STATUS_RED}"/>`
          : ""
      }
    `;
  };

  const y1 = startY;
  const y2 = startY + stripeH + gap;
  const y3 = startY + (stripeH + gap) * 2;

  const arrowPath = `M${cardW / 2 - 5} ${cardH} L${cardW / 2} ${totalH - 1} L${cardW / 2 + 5} ${cardH} Z`;

  // 선택 시 드롭섀도 필터
  const shadowFilter = selected
    ? `<defs><filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
         <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#f97316" flood-opacity="0.5"/>
       </filter></defs>`
    : "";
  const filterAttr = selected ? ' filter="url(#ds)"' : "";

  // DPR 배율로 래스터화 크기를 키워 고해상도 디스플레이에서 선명하게 표시
  const renderW = Math.round((w + 4) * DPR);
  const renderH = Math.round((totalH + 2) * DPR);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}" viewBox="-2 -2 ${w + 4} ${totalH + 2}">
    ${shadowFilter}
    <g${filterAttr}>
    <!-- 화살표 -->
    <path d="${arrowPath}" fill="white" stroke="${outlineColor}" stroke-width="${outlineWidth}" stroke-linejoin="round"/>
    <!-- 카드 본체 -->
    <rect x="0.5" y="0.5" width="${cardW - 1}" height="${cardH - 1}" rx="3" ry="3"
      fill="white" stroke="${outlineColor}" stroke-width="${outlineWidth}"/>
    <!-- 3개 시설 줄 (각각 비율 막대) -->
    ${stripe(y1, ratios.substNoPct)}
    ${stripe(y2, ratios.mtrNoPct)}
    ${stripe(y3, ratios.dlNoPct)}
    <!-- 화살표 이음새 마감 -->
    <line x1="${cardW / 2 - 5}" y1="${cardH - 0.5}" x2="${cardW / 2 + 5}" y2="${cardH - 0.5}"
      stroke="white" stroke-width="1.2"/>
    ${badge}
    </g>
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

/** 마커 사이즈 헬퍼 — 카드 폭/총 높이 + 우측 배지 영역 고려 */
function markerSize(count: number): { w: number; h: number } {
  const cardW = 28;
  const cardH = 30;
  const arrowH = 8;
  const badgeGap = 2;
  const showBadge = count > 1;
  const badgeText = count > 9999 ? "9999+" : String(count);
  const badgeWidth = badgeText.length <= 2 ? 18 : badgeText.length === 3 ? 22 : badgeText.length === 4 ? 28 : 34;
  return {
    w: showBadge ? cardW + badgeGap + badgeWidth : cardW,
    h: cardH + arrowH,
  };
}

export default function KakaoMap({
  rows,
  colorFilter,
  onMarkerClick,
  fitBoundsKey,
  onMapReady,
  measureMode = false,
  measureAddPointRef,
  selectedAddr = null,
  mapType = "roadmap",
  compareRows = [],
}: Props) {
  // 측정 모드 여부를 클릭 핸들러에서 참조하기 위한 ref
  // (state로 전달하면 마커 재생성이 발생하므로 ref로 우회)
  const measureModeRef = useRef(measureMode);
  measureModeRef.current = measureMode;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const lastFitKeyRef = useRef(-1);
  // 마커 위 마을명 라벨(CustomOverlay) — 줌 인 했을 때만 표시
  const labelOverlaysRef = useRef<any[]>([]);
  // 줌 변경 리스너 핸들 (마커 effect 재실행 시 정리)
  const zoomListenerRef = useRef<any>(null);
  // 마커 참조 맵 (geocode_address → kakao.maps.Marker) — 선택 변경 시 이미지 교체용
  const markersByAddrRef = useRef<Map<string, { marker: any; row: MapSummaryRow }>>(
    new Map()
  );
  // 선택 마커 펄스 링 오버레이
  const pulseOverlayRef = useRef<any>(null);

  /** 마을명 라벨을 보여줄 줌 레벨 임계값 (이하일 때 표시 — 카카오는 숫자 작을수록 확대) */
  const LABEL_VISIBLE_LEVEL = 7;

  // SDK 로드
  useEffect(() => {
    if (window.kakao?.maps) {
      setLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=clusterer,services`;
    script.onload = () => window.kakao.maps.load(() => setLoaded(true));
    document.head.appendChild(script);
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (!loaded || !mapRef.current || mapInstanceRef.current) return;

    const map = new window.kakao.maps.Map(mapRef.current, {
      center: new window.kakao.maps.LatLng(36.5, 127.8),
      level: 13,
    });
    mapInstanceRef.current = map;
    (window as any).__kepcoMap = map;

    // 줌 컨트롤은 MapToolbar에서 커스텀으로 제공 — SDK 내장 컨트롤 제거

    // 상위(MapClient)에 인스턴스 전달 → 거리재기 등 도구가 직접 제어
    onMapReady?.(map);
  }, [loaded, onMapReady]);

  // 지도 타입 변경
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!loaded || !map) return;
    const typeId =
      mapType === "skyview"
        ? window.kakao.maps.MapTypeId.SKYVIEW
        : mapType === "hybrid"
          ? window.kakao.maps.MapTypeId.HYBRID
          : window.kakao.maps.MapTypeId.ROADMAP;
    map.setMapTypeId(typeId);
  }, [loaded, mapType]);

  // 측정 모드 진입/해제 시 커서 모양 변경.
  // 카카오 SDK 내부 자식 요소가 자기 cursor를 설정하므로, body에 클래스를 토글해
  // globals.css 의 !important 규칙으로 전체를 강제한다.
  useEffect(() => {
    if (measureMode) {
      document.body.classList.add("measure-mode");
    } else {
      document.body.classList.remove("measure-mode");
    }
    return () => {
      document.body.classList.remove("measure-mode");
    };
  }, [measureMode]);


  // 마커 + 클러스터러 갱신
  useEffect(() => {
    if (!loaded || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (clustererRef.current) clustererRef.current.clear();

    // 이전 라벨/줌 리스너 정리 (메모리 누수 방지)
    labelOverlaysRef.current.forEach((o) => o.setMap(null));
    labelOverlaysRef.current = [];
    if (zoomListenerRef.current) {
      window.kakao.maps.event.removeListener(
        map,
        "zoom_changed",
        zoomListenerRef.current
      );
      zoomListenerRef.current = null;
    }

    const filtered = rows.filter((r) => {
      const color = colorForMarker(r);
      return colorFilter.has(color);
    });
    if (filtered.length === 0) return;

    // 이전 마커 맵 초기화 — 새로 그리는 마커들로 교체
    markersByAddrRef.current.clear();

    // SVG → PNG 변환이 비동기이므로, effect 재실행 시 이전 작업 무시
    let cancelled = false;

    (async () => {
    const markers = await Promise.all(filtered.map(async (row) => {
      const position = new window.kakao.maps.LatLng(row.lat, row.lng);
      const ratios = ratiosForMarker(row);
      const count = row.total;
      const { w: imgW, h: imgH } = markerSize(count);
      // 카드 중앙 하단(화살표 끝)이 좌표 점에 정확히 닿게 offset 지정
      const cardCenterX = 14; // cardW(28)/2
      const isSelected = row.geocode_address === selectedAddr;

      const svgUri = makeMarkerSvg(ratios, count, isSelected);
      const pngUri = await svgToPng(svgUri, imgW, imgH);

      const marker = new window.kakao.maps.Marker({
        position,
        image: new window.kakao.maps.MarkerImage(
          pngUri,
          new window.kakao.maps.Size(imgW, imgH),
          { offset: new window.kakao.maps.Point(cardCenterX, imgH) }
        ),
        zIndex: isSelected ? 10 : undefined,
      });

      // 선택 상태 변경 시 이미지만 교체하기 위해 참조 저장
      markersByAddrRef.current.set(row.geocode_address, { marker, row });

      window.kakao.maps.event.addListener(marker, "click", () => {
        // 측정 모드: 점 추가만 하고 종료 (상세 카드 X, panTo X)
        if (measureModeRef.current) {
          measureAddPointRef?.current?.(position);
          return;
        }
        map.panTo(position);
        onMarkerClick(row);
      });

      return marker;
    }));

    if (cancelled) return;

    clustererRef.current = new window.kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 5,
      gridSize: 60,
      markers,
      // 기본 클릭 줌을 끄고 아래 clusterclick 리스너에서 수동 처리
      // (측정 모드에서는 확대 자체를 막기 위함)
      disableClickZoom: true,
      styles: [
        {
          width: "40px", height: "40px",
          background: "rgba(59,130,246,0.9)",
          color: "white", textAlign: "center", lineHeight: "40px",
          borderRadius: "50%", fontSize: "12px", fontWeight: "bold",
          border: "2px solid white",
        },
        {
          width: "50px", height: "50px",
          background: "rgba(59,130,246,0.9)",
          color: "white", textAlign: "center", lineHeight: "50px",
          borderRadius: "50%", fontSize: "13px", fontWeight: "bold",
          border: "2px solid white",
        },
        {
          width: "60px", height: "60px",
          background: "rgba(59,130,246,0.9)",
          color: "white", textAlign: "center", lineHeight: "60px",
          borderRadius: "50%", fontSize: "14px", fontWeight: "bold",
          border: "2px solid white",
        },
      ],
    });

    // ─────────────────────────────────────────────
    // 마을명 라벨 — 각 마커 아래에 작은 텍스트 박스
    //   줌이 충분히 가까울 때(level <= LABEL_VISIBLE_LEVEL)만 보이도록
    //   zoom_changed 이벤트로 토글한다.
    // ─────────────────────────────────────────────
    labelOverlaysRef.current = filtered.map((row) => {
      // "리"를 우선 표시, 기타지역이면 "동" 폴백
      const li = row.addr_li && !row.addr_li.includes("기타지역") ? row.addr_li : "";
      const placeName = li || row.addr_dong || "";
      // 잔여 용량 — 사업자가 가장 알고 싶은 정보. kW/MW 자동 변환
      const kw = row.max_remaining_kw ?? 0;
      const remainText =
        kw <= 0
          ? ""
          : kw >= 1000
            ? `${(kw / 1000).toFixed(1)}MW`
            : `${kw.toLocaleString()}kW`;
      // 잔여가 있으면 강조 색(파랑), 없으면 회색
      const remainColor = kw > 0 ? "#1d4ed8" : "#9ca3af";

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(row.lat, row.lng),
        content: `
          <div style="
            transform: translate(-50%, 4px);
            background: rgba(255,255,255,0.95);
            color: #1f2937;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid rgba(0,0,0,0.1);
            white-space: nowrap;
            box-shadow: 0 1px 2px rgba(0,0,0,0.15);
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span>${placeName}</span>
            ${
              remainText
                ? `<span style="color:${remainColor};font-weight:700;">· ${remainText}</span>`
                : ""
            }
          </div>
        `,
        yAnchor: 0,
        xAnchor: 0.5,
        zIndex: 4,
      });
      return overlay;
    });

    const applyLabelVisibility = () => {
      const level = map.getLevel();
      const labelVisible = level <= LABEL_VISIBLE_LEVEL;
      labelOverlaysRef.current.forEach((o) => o.setMap(labelVisible ? map : null));
    };
    applyLabelVisibility();

    zoomListenerRef.current = applyLabelVisibility;
    window.kakao.maps.event.addListener(
      map,
      "zoom_changed",
      zoomListenerRef.current
    );

    // 클러스터 클릭
    //  - 측정 모드: 클러스터 중심을 측정 점으로 추가 (확대 X)
    //  - 일반 모드: 한 단계 확대
    window.kakao.maps.event.addListener(
      clustererRef.current,
      "clusterclick",
      (cluster: any) => {
        const center = cluster.getCenter();
        if (measureModeRef.current) {
          measureAddPointRef?.current?.(center);
          return;
        }
        const level = map.getLevel() - 1;
        map.setLevel(level, { anchor: center });
      }
    );

    if (filtered.length > 0 && lastFitKeyRef.current !== fitBoundsKey) {
      const bounds = new window.kakao.maps.LatLngBounds();
      filtered.forEach((r) => {
        bounds.extend(new window.kakao.maps.LatLng(r.lat, r.lng));
      });
      map.setBounds(bounds);
      lastFitKeyRef.current = fitBoundsKey;
    }
    })(); // async IIFE 끝

    return () => { cancelled = true; };
    // selectedAddr은 의도적으로 deps에서 제외 — 전체 재생성 X, 아래 별도 effect에서 해당 마커만 이미지 교체
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rows, colorFilter, fitBoundsKey, onMarkerClick]);

  /**
   * 선택 마을 변경 시, 이전/새 마커의 이미지만 교체한다.
   * 마커 effect와 분리되어 있어 rows/colorFilter 변화 없이 선택만 바뀌면
   * 전체 마커 재생성이 일어나지 않아 가볍다.
   */
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const map = mapInstanceRef.current;

    const rebuildImage = async (addr: string | null, selected: boolean) => {
      if (!addr) return;
      const entry = markersByAddrRef.current.get(addr);
      if (!entry) return;
      const { marker, row } = entry;
      const ratios = ratiosForMarker(row);
      const { w: imgW, h: imgH } = markerSize(row.total);
      const svgUri = makeMarkerSvg(ratios, row.total, selected);
      const pngUri = await svgToPng(svgUri, imgW, imgH);
      marker.setImage(
        new window.kakao.maps.MarkerImage(
          pngUri,
          new window.kakao.maps.Size(imgW, imgH),
          { offset: new window.kakao.maps.Point(14, imgH) }
        )
      );
      if (marker.setZIndex) marker.setZIndex(selected ? 10 : 0);
    };

    // 이전 선택 해제
    if (prevSelectedRef.current && prevSelectedRef.current !== selectedAddr) {
      rebuildImage(prevSelectedRef.current, false);
    }

    // 이전 펄스 링 제거
    if (pulseOverlayRef.current) {
      pulseOverlayRef.current.setMap(null);
      pulseOverlayRef.current = null;
    }

    // 새 선택 강조
    if (selectedAddr && map) {
      rebuildImage(selectedAddr, true);

      // 펄스 링 오버레이 추가 — 인라인 스타일로 CSS 의존성 제거
      // markersByAddrRef가 비동기 생성 중 비어있을 수 있으므로 rows에서 직접 좌표 조회
      const entry = markersByAddrRef.current.get(selectedAddr);
      const selRow = !entry ? rows.find(r => r.geocode_address === selectedAddr) : null;
      const pos = entry
        ? entry.marker.getPosition()
        : selRow && selRow.lat != null && selRow.lng != null
          ? new window.kakao.maps.LatLng(selRow.lat, selRow.lng)
          : null;
      if (pos) {
        const pulseHtml = `
          <div style="position:relative;width:0;height:0;">
            <div style="
              position:absolute;left:-20px;top:-20px;
              width:40px;height:40px;border-radius:50%;
              border:2.5px solid #f97316;
              animation:kepcoPulse 2s ease-out infinite;
              pointer-events:none;
            "></div>
            <style>
              @keyframes kepcoPulse {
                0% { transform:scale(0.5); opacity:0.7; }
                100% { transform:scale(2.5); opacity:0; }
              }
            </style>
          </div>`;
        pulseOverlayRef.current = new window.kakao.maps.CustomOverlay({
          position: pos,
          content: pulseHtml,
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: 1,
        });
        pulseOverlayRef.current.setMap(map);
      }
    }
    prevSelectedRef.current = selectedAddr;
  }, [loaded, selectedAddr]);

  // ── 비교 오버레이 ──
  const compareOverlaysRef = useRef<any[]>([]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !loaded) return;

    // 기존 오버레이 제거
    compareOverlaysRef.current.forEach((o) => o.setMap(null));
    compareOverlaysRef.current = [];

    if (compareRows.length === 0) return;

    // geocode_address별로 그룹핑 → 마을 단위 오버레이
    const byAddr = new Map<string, { rows: CompareRefRow[]; lat: number; lng: number }>();
    for (const r of compareRows) {
      if (!byAddr.has(r.geocode_address)) {
        byAddr.set(r.geocode_address, { rows: [], lat: r.lat, lng: r.lng });
      }
      byAddr.get(r.geocode_address)!.rows.push(r);
    }

    byAddr.forEach(({ rows: cRows, lat, lng }, addr) => {
      // 마을 내 방향 판단 (ref 기반)
      let gained = 0;
      let lost = 0;
      for (const r of cRows) {
        if (!r.prev_subst_ok && r.curr_subst_ok) gained++;
        if (r.prev_subst_ok && !r.curr_subst_ok) lost++;
        if (!r.prev_mtr_ok && r.curr_mtr_ok) gained++;
        if (r.prev_mtr_ok && !r.curr_mtr_ok) lost++;
        if (!r.prev_dl_ok && r.curr_dl_ok) gained++;
        if (r.prev_dl_ok && !r.curr_dl_ok) lost++;
      }
      const hasWorsen = lost > 0;
      const hasImprove = gained > 0;

      let color: string;
      let arrow: string;
      let ringColor: string;
      if (hasWorsen && hasImprove) {
        color = "#f59e0b"; // amber — mixed
        arrow = "&#8693;"; // ⇅
        ringColor = "rgba(245,158,11,0.3)";
      } else if (hasWorsen) {
        color = "#ef4444"; // red — worsened
        arrow = "&#9660;"; // ▼
        ringColor = "rgba(239,68,68,0.3)";
      } else {
        color = "#22c55e"; // green — improved
        arrow = "&#9650;"; // ▲
        ringColor = "rgba(34,197,94,0.3)";
      }

      const html = `
        <div style="position:relative;width:0;height:0;pointer-events:none;">
          <div style="
            position:absolute;left:-16px;top:-16px;
            width:32px;height:32px;border-radius:50%;
            background:${ringColor};
            border:2.5px solid ${color};
            display:flex;align-items:center;justify-content:center;
            font-size:14px;color:${color};font-weight:bold;
            pointer-events:auto;cursor:pointer;
            animation:kepcoCompPulse 2.5s ease-out infinite;
          ">${arrow}<span style="font-size:9px;margin-left:1px;">${cRows.length}</span></div>
          <style>
            @keyframes kepcoCompPulse {
              0% { box-shadow: 0 0 0 0 ${ringColor}; }
              70% { box-shadow: 0 0 0 12px rgba(0,0,0,0); }
              100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
            }
          </style>
        </div>`;

      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(lat, lng),
        content: html,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 100,
      });
      overlay.setMap(map);
      compareOverlaysRef.current.push(overlay);
    });
  }, [loaded, compareRows]);

  return <div ref={mapRef} className="w-full h-full" />;
}
