"use client";

import { useEffect, useRef, useState } from "react";
import type { LocationGroup, MarkerColor, ViewMode } from "@/lib/types";
import LocationSummaryCard from "./LocationSummaryCard";
import LocationDetailModal from "./LocationDetailModal";

declare global {
  interface Window {
    kakao: any;
  }
}

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "";

const COLOR_HEX: Record<MarkerColor, string> = {
  red: "#EF4444",
  blue: "#3B82F6",
  green: "#22C55E",
  yellow: "#EAB308",
};


/** SVG 마커 생성 (핀 + 건수 배지) */
function makeMarkerSvg(color: string, count: number = 1): string {
  // 1건이면 일반 핀, 2건 이상이면 우상단에 숫자 배지
  const showBadge = count > 1;
  const badgeText = count > 999 ? "999+" : String(count);
  const badgeWidth = badgeText.length <= 2 ? 18 : badgeText.length === 3 ? 22 : 28;

  const w = showBadge ? 36 + badgeWidth - 18 : 28;
  const pinX = 0;

  const badge = showBadge
    ? `<rect x="${pinX + 18}" y="0" width="${badgeWidth}" height="16" rx="8" ry="8"
         fill="#1f2937" stroke="white" stroke-width="1.5"/>
       <text x="${pinX + 18 + badgeWidth / 2}" y="11" text-anchor="middle"
         font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="white">${badgeText}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="36" viewBox="0 0 ${w} 36">
    <path d="M${pinX + 14} 0 C${pinX + 6} 0 ${pinX} 6 ${pinX} 14 C${pinX} 24 ${pinX + 14} 36 ${pinX + 14} 36 C${pinX + 14} 36 ${pinX + 28} 24 ${pinX + 28} 14 C${pinX + 28} 6 ${pinX + 22} 0 ${pinX + 14} 0 Z"
      fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="${pinX + 14}" cy="14" r="5" fill="white"/>
    ${badge}
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

interface KakaoMapProps {
  groups: LocationGroup[];
  filter: Set<MarkerColor>;
  fitBoundsKey: number;
  viewMode: ViewMode;
  onApplyFacilityFilter?: (kind: "subst" | "mtr" | "dl", name: string) => void;
}

export default function KakaoMap({ groups, filter, fitBoundsKey, viewMode, onApplyFacilityFilter }: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const lastFitKeyRef = useRef<number>(-1);

  // 인포윈도우 상태
  const [selectedGroup, setSelectedGroup] = useState<LocationGroup | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 거리재기 상태
  const [measureMode, setMeasureMode] = useState(false);
  const [measureDistance, setMeasureDistance] = useState(0);
  const measurePointsRef = useRef<any[]>([]);
  const measurePolylineRef = useRef<any>(null);
  const measureDotsRef = useRef<any[]>([]);
  const measureLabelRef = useRef<any>(null);
  const measureModeRef = useRef(false);
  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);

  /** 측정 점 추가 (지도 클릭 또는 마커 클릭에서 호출) */
  const addMeasurePoint = (latlng: any) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    measurePointsRef.current.push(latlng);

    if (measurePolylineRef.current) measurePolylineRef.current.setMap(null);
    const polyline = new window.kakao.maps.Polyline({
      path: measurePointsRef.current,
      strokeWeight: 4,
      strokeColor: "#3B82F6",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
    });
    polyline.setMap(map);
    measurePolylineRef.current = polyline;

    const dot = new window.kakao.maps.CustomOverlay({
      position: latlng,
      content:
        '<div style="width:10px;height:10px;background:#3B82F6;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>',
      yAnchor: 0.5,
      xAnchor: 0.5,
    });
    dot.setMap(map);
    measureDotsRef.current.push(dot);

    const dist = polyline.getLength();
    setMeasureDistance(dist);

    if (measureLabelRef.current) measureLabelRef.current.setMap(null);
    if (measurePointsRef.current.length >= 2) {
      const label = new window.kakao.maps.CustomOverlay({
        position: latlng,
        content: `<div style="background:white;border:2px solid #3B82F6;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:bold;color:#1f2937;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${formatDistance(dist)}</div>`,
        yAnchor: 1.6,
        xAnchor: 0.5,
      });
      label.setMap(map);
      measureLabelRef.current = label;
    }
  };

  const clearMeasure = () => {
    if (measurePolylineRef.current) measurePolylineRef.current.setMap(null);
    measureDotsRef.current.forEach((d) => d.setMap(null));
    if (measureLabelRef.current) measureLabelRef.current.setMap(null);
    measurePolylineRef.current = null;
    measureDotsRef.current = [];
    measureLabelRef.current = null;
    measurePointsRef.current = [];
    setMeasureDistance(0);
  };

  const exitMeasure = () => {
    clearMeasure();
    setMeasureMode(false);
  };

  // SDK 로드
  useEffect(() => {
    if (window.kakao?.maps) {
      setLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=clusterer,services`;
    script.onload = () => {
      window.kakao.maps.load(() => setLoaded(true));
    };
    document.head.appendChild(script);
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    if (mapInstanceRef.current) return;

    const map = new window.kakao.maps.Map(mapRef.current, {
      center: new window.kakao.maps.LatLng(36.5, 127.8),
      level: 13,
    });
    mapInstanceRef.current = map;
    // 외부(검색 등)에서 map 인스턴스 접근용
    (window as any).__kepcoMap = map;

    map.addControl(
      new window.kakao.maps.ZoomControl(),
      window.kakao.maps.ControlPosition.RIGHT
    );

    // 빈 영역 클릭 시 인포윈도우 닫기
    window.kakao.maps.event.addListener(map, "click", () => {
      setSelectedGroup(null);
      if (overlayRef.current) overlayRef.current.setMap(null);
    });
  }, [loaded]);

  // 마커 + 클러스터러 갱신
  useEffect(() => {
    if (!loaded || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // 기존 클러스터러 정리
    if (clustererRef.current) {
      clustererRef.current.clear();
    }

    const filtered = groups.filter((g) => filter.has(g.color));
    if (filtered.length === 0) return;

    const markers = filtered.map((group) => {
      const position = new window.kakao.maps.LatLng(group.lat, group.lng);
      const count = group.items.length;
      const showBadge = count > 1;
      const badgeText = count > 999 ? "999+" : String(count);
      const badgeWidth = badgeText.length <= 2 ? 18 : badgeText.length === 3 ? 22 : 28;
      const imgW = showBadge ? 36 + badgeWidth - 18 : 28;

      const marker = new window.kakao.maps.Marker({
        position,
        image: new window.kakao.maps.MarkerImage(
          makeMarkerSvg(COLOR_HEX[group.color], count),
          new window.kakao.maps.Size(imgW, 36),
          { offset: new window.kakao.maps.Point(14, 36) }
        ),
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        // 거리재기 모드: 마커 위치를 측정 점으로 사용
        if (measureModeRef.current) {
          addMeasurePoint(position);
          return;
        }
        setSelectedGroup(group);
        // 부드러운 이동
        map.panTo(position);
      });

      return marker;
    });

    clustererRef.current = new window.kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 5,
      gridSize: 60,
      markers,
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

    // 새 데이터 로드 시에만 전체 영역에 맞춤
    if (filtered.length > 0 && lastFitKeyRef.current !== fitBoundsKey) {
      const bounds = new window.kakao.maps.LatLngBounds();
      filtered.forEach((g) => {
        bounds.extend(new window.kakao.maps.LatLng(g.lat, g.lng));
      });
      map.setBounds(bounds);
      lastFitKeyRef.current = fitBoundsKey;
    }
  }, [loaded, groups, filter, fitBoundsKey]);

  // 거리재기 모드: 클릭으로 점 추가
  useEffect(() => {
    if (!loaded || !mapInstanceRef.current) return;
    if (!measureMode) {
      if (mapRef.current) mapRef.current.style.cursor = "";
      return;
    }

    const map = mapInstanceRef.current;
    if (mapRef.current) mapRef.current.style.cursor = "crosshair";

    const clickHandler = (mouseEvent: any) => {
      addMeasurePoint(mouseEvent.latLng);
    };

    window.kakao.maps.event.addListener(map, "click", clickHandler);

    return () => {
      window.kakao.maps.event.removeListener(map, "click", clickHandler);
      if (mapRef.current) mapRef.current.style.cursor = "";
    };
  }, [loaded, measureMode]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* 거리재기 컨트롤 (우측 상단) */}
      <div className="absolute top-4 right-4 z-10">
        {!measureMode ? (
          <button
            onClick={() => setMeasureMode(true)}
            className="bg-white shadow-md rounded-lg px-3 py-2 border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
            title="지도에서 두 지점 이상 클릭하여 거리를 측정합니다"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 3m0 0l3-3m-3 3V3m6 18l3-3m0 0l-3-3m3 3H9" />
            </svg>
            거리재기
          </button>
        ) : (
          <div className="bg-white shadow-lg rounded-lg border border-blue-300 overflow-hidden min-w-[180px]">
            <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
              <div className="text-[10px] text-blue-700 font-medium mb-0.5">
                지도를 클릭해 거리 측정
              </div>
              <div className="text-base font-bold text-gray-900">
                {measurePointsRef.current.length < 2
                  ? "시작점을 클릭하세요"
                  : formatDistance(measureDistance)}
              </div>
              {measurePointsRef.current.length > 0 && (
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {measurePointsRef.current.length}개 지점
                </div>
              )}
            </div>
            <div className="flex">
              <button
                onClick={clearMeasure}
                className="flex-1 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 border-r border-gray-200"
              >
                초기화
              </button>
              <button
                onClick={exitMeasure}
                className="flex-1 px-3 py-2 text-xs text-blue-600 font-medium hover:bg-blue-50"
              >
                종료
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 좌하단 요약 카드 */}
      {selectedGroup && (
        <LocationSummaryCard
          group={selectedGroup}
          onShowDetail={() => setDetailOpen(true)}
          onClose={() => {
            setSelectedGroup(null);
            setDetailOpen(false);
          }}
          onApplyFacilityFilter={onApplyFacilityFilter}
        />
      )}

      {/* 상세 목록 모달 */}
      {selectedGroup && detailOpen && (
        <LocationDetailModal
          group={selectedGroup}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}

/** 거리 포맷팅 (m / km) */
function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}
