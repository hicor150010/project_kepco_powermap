"use client";

import { useEffect, useRef, useState } from "react";
import type { MapSummaryRow, MarkerColor } from "@/lib/types";
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
function makeMarkerSvg(
  ratios: MarkerRatios,
  count: number,
  selected: boolean = false
): string {
  const cardW = 28;
  const cardH = 30;
  const arrowH = 8;
  const totalH = cardH + arrowH;

  // 선택 상태: 진한 파란 테두리 + 노란 외곽 glow, 일반: 얇은 회색 테두리
  const outlineColor = selected ? "#2563eb" : "rgba(0,0,0,0.35)";
  const outlineWidth = selected ? 2 : 1;

  const showBadge = count > 1;
  const badgeText = count > 999 ? "999+" : String(count);
  const badgeWidth = badgeText.length <= 2 ? 18 : badgeText.length === 3 ? 22 : 28;
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

  // 선택 시 카드 바깥에 얇은 파란 glow ring (rect의 stroke를 두 번 그려서 표현)
  const glow = selected
    ? `<rect x="-1" y="-1" width="${cardW + 2}" height="${cardH + 2}" rx="4" ry="4"
         fill="none" stroke="rgba(37,99,235,0.35)" stroke-width="3"/>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${totalH}" viewBox="-2 -2 ${w + 4} ${totalH + 2}">
    ${glow}
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
  const badgeText = count > 999 ? "999+" : String(count);
  const badgeWidth = badgeText.length <= 2 ? 18 : badgeText.length === 3 ? 22 : 28;
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
  // 마커 범위 표시 원형 오버레이
  const circleOverlaysRef = useRef<any[]>([]);
  // 줌 변경 리스너 핸들 (마커 effect 재실행 시 정리)
  const zoomListenerRef = useRef<any>(null);
  // 마커 참조 맵 (geocode_address → kakao.maps.Marker) — 선택 변경 시 이미지 교체용
  const markersByAddrRef = useRef<Map<string, { marker: any; row: MapSummaryRow }>>(
    new Map()
  );

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

    const markers = filtered.map((row) => {
      const position = new window.kakao.maps.LatLng(row.lat, row.lng);
      const ratios = ratiosForMarker(row);
      const count = row.total;
      const { w: imgW, h: imgH } = markerSize(count);
      // 카드 중앙 하단(화살표 끝)이 좌표 점에 정확히 닿게 offset 지정
      const cardCenterX = 14; // cardW(28)/2
      const isSelected = row.geocode_address === selectedAddr;

      const marker = new window.kakao.maps.Marker({
        position,
        image: new window.kakao.maps.MarkerImage(
          makeMarkerSvg(ratios, count, isSelected),
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
    });

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
    // 범위 표시 원형 — 마커가 점이 아닌 범위임을 시각화
    //   줌이 충분히 가까울 때(level <= CIRCLE_VISIBLE_LEVEL)만 보이도록 토글
    // ─────────────────────────────────────────────
    circleOverlaysRef.current.forEach((c) => c.setMap(null));
    const CIRCLE_VISIBLE_LEVEL = 7;
    circleOverlaysRef.current = filtered.map((row) => {
      // 데이터 건수에 따라 반지름 조절 (최소 150m ~ 최대 500m)
      const radius = Math.min(500, Math.max(150, row.total * 3));
      // 여유 비율에 따라 색상 결정
      const noCapRatio = (row.dl_no_cap ?? 0) / Math.max(row.total, 1);
      const color = noCapRatio > 0.5 ? "#ef4444" : noCapRatio > 0.2 ? "#f59e0b" : "#3b82f6";

      const circle = new window.kakao.maps.Circle({
        center: new window.kakao.maps.LatLng(row.lat, row.lng),
        radius,
        strokeWeight: 1,
        strokeColor: color,
        strokeOpacity: 0.3,
        fillColor: color,
        fillOpacity: 0.08,
      });
      return circle;
    });

    // ─────────────────────────────────────────────
    // 마을명 라벨 — 각 마커 아래에 작은 텍스트 박스
    //   줌이 충분히 가까울 때(level <= LABEL_VISIBLE_LEVEL)만 보이도록
    //   zoom_changed 이벤트로 토글한다.
    // ─────────────────────────────────────────────
    labelOverlaysRef.current = filtered.map((row) => {
      // "리"를 우선 표시, 없으면 "동/면" 폴백
      const placeName = row.addr_li || row.addr_dong || "";
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
      const circleVisible = level <= CIRCLE_VISIBLE_LEVEL;
      circleOverlaysRef.current.forEach((c) => c.setMap(circleVisible ? map : null));
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
    const rebuildImage = (addr: string | null, selected: boolean) => {
      if (!addr) return;
      const entry = markersByAddrRef.current.get(addr);
      if (!entry) return;
      const { marker, row } = entry;
      const ratios = ratiosForMarker(row);
      const { w: imgW, h: imgH } = markerSize(row.total);
      marker.setImage(
        new window.kakao.maps.MarkerImage(
          makeMarkerSvg(ratios, row.total, selected),
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
    // 새 선택 강조
    if (selectedAddr) {
      rebuildImage(selectedAddr, true);
    }
    prevSelectedRef.current = selectedAddr;
  }, [loaded, selectedAddr]);

  return <div ref={mapRef} className="w-full h-full" />;
}
