"use client";

/**
 * 거리재기 도구.
 *
 * 책임 범위:
 *   1) 지도 클릭 → 점 추가 → 폴리라인 자동 연장
 *   2) 각 구간 누적 거리 라벨(CustomOverlay) 표시
 *   3) 하단 컨트롤 바(되돌리기/초기화/완료)
 *
 * 부모(MapClient)는 단순히 active 토글과 map 인스턴스만 넘겨주면 된다.
 * 이 컴포넌트는 active=false일 때 모든 오버레이를 정리한다.
 *
 * 주의: 카카오 SDK는 React 가상 DOM 바깥의 객체이므로
 * 모든 그리기 객체는 ref 로 직접 추적·해제한다.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { formatDistance, haversineMeters } from "@/lib/geo/distance";

interface Props {
  /** 카카오 지도 인스턴스 (없으면 아무것도 안 함) */
  map: any | null;
  /** 거리재기 활성화 여부 */
  active: boolean;
  /** 종료 요청 (완료 버튼/ESC) */
  onClose: () => void;
  /**
   * 외부(MapClient의 마커 클릭 핸들러)에서 점을 추가할 수 있도록
   * addPoint 함수를 부모에 등록한다. active 토글 시 자동 해제.
   */
  registerAddPoint?: (fn: ((latlng: any) => void) | null) => void;
}

export default function DistanceTool({
  map,
  active,
  onClose,
  registerAddPoint,
}: Props) {
  // 클릭한 좌표 누적 (kakao.maps.LatLng 객체 배열)
  const [points, setPoints] = useState<any[]>([]);

  // 카카오 객체 ref — 매번 destroy 후 재생성
  const polylineRef = useRef<any>(null);
  const dotMarkersRef = useRef<any[]>([]);
  const labelOverlaysRef = useRef<any[]>([]);
  const clickListenerRef = useRef<any>(null);
  const rightClickListenerRef = useRef<any>(null);

  // ─────────────────────────────────────────────
  // 모든 오버레이 정리 (모드 종료 / 초기화 시 호출)
  // ─────────────────────────────────────────────
  const clearOverlays = useCallback(() => {
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    dotMarkersRef.current.forEach((m) => m.setMap(null));
    dotMarkersRef.current = [];
    labelOverlaysRef.current.forEach((o) => o.setMap(null));
    labelOverlaysRef.current = [];
  }, []);

  // ─────────────────────────────────────────────
  // 지도 클릭(좌/우) 리스너 등록/해제 — 네이버와 동일 UX:
  //   좌클릭: 점 추가  /  우클릭: 측정 종료
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    if (active) {
      // 좌클릭 → 점 추가
      const clickHandler = (mouseEvent: any) => {
        const latlng = mouseEvent.latLng;
        setPoints((prev) => [...prev, latlng]);
      };
      window.kakao.maps.event.addListener(map, "click", clickHandler);
      clickListenerRef.current = clickHandler;

      // 우클릭 → 종료 (네이버 거리재기와 동일)
      const rightClickHandler = () => {
        onClose();
      };
      window.kakao.maps.event.addListener(map, "rightclick", rightClickHandler);
      rightClickListenerRef.current = rightClickHandler;

      return () => {
        if (clickListenerRef.current) {
          window.kakao.maps.event.removeListener(map, "click", clickListenerRef.current);
          clickListenerRef.current = null;
        }
        if (rightClickListenerRef.current) {
          window.kakao.maps.event.removeListener(
            map,
            "rightclick",
            rightClickListenerRef.current
          );
          rightClickListenerRef.current = null;
        }
      };
    }
  }, [map, active, onClose]);

  // ─────────────────────────────────────────────
  // 모드 종료 시 점/선/라벨 모두 제거
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      clearOverlays();
      setPoints([]);
    }
  }, [active, clearOverlays]);

  // ─────────────────────────────────────────────
  // 외부에서 점을 추가할 수 있는 함수를 부모에 등록
  // (마커 클릭 → 그 좌표를 측정 점으로 사용)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!registerAddPoint) return;
    if (active) {
      registerAddPoint((latlng: any) => {
        setPoints((prev) => [...prev, latlng]);
      });
      return () => registerAddPoint(null);
    }
  }, [active, registerAddPoint]);

  // ─────────────────────────────────────────────
  // ESC 키로 종료
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);

  // ─────────────────────────────────────────────
  // points 변경 시 폴리라인/점/누적 라벨 재생성
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!map || !active) return;

    // 이전 그리기 제거
    clearOverlays();

    if (points.length === 0) return;

    // 1) 점 마커 (작은 흰 원 + 파란 테두리)
    const dotSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14">' +
      '<circle cx="7" cy="7" r="5" fill="white" stroke="#3b82f6" stroke-width="2"/>' +
      "</svg>";
    const dotImg = new window.kakao.maps.MarkerImage(
      "data:image/svg+xml;base64," + btoa(dotSvg),
      new window.kakao.maps.Size(14, 14),
      { offset: new window.kakao.maps.Point(7, 7) }
    );
    dotMarkersRef.current = points.map((p) => {
      const m = new window.kakao.maps.Marker({
        position: p,
        image: dotImg,
        zIndex: 5,
      });
      m.setMap(map);
      return m;
    });

    // 2) 폴리라인 (점이 2개 이상일 때만)
    if (points.length >= 2) {
      const polyline = new window.kakao.maps.Polyline({
        path: points,
        strokeWeight: 4,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.85,
        strokeStyle: "solid",
      });
      polyline.setMap(map);
      polylineRef.current = polyline;
    }

    // 3) 점별 누적 거리 라벨 (네이버와 동일)
    //    - 첫 점: "시작" 표시
    //    - 두 번째 점부터: 누적 거리(haversine) 표시
    //    - 마지막 점: 굵게 강조해서 총 거리 강조
    let cumulative = 0;
    points.forEach((p, i) => {
      if (i > 0) {
        const prev = points[i - 1];
        cumulative += haversineMeters(
          prev.getLat(),
          prev.getLng(),
          p.getLat(),
          p.getLng()
        );
      }

      const isFirst = i === 0;
      const isLast = i === points.length - 1 && points.length >= 2;
      const label = isFirst ? "시작" : formatDistance(cumulative);

      // 마지막 점은 좀 더 큰/굵은 검정 배지, 중간 점은 회색 배지
      const bg = isLast ? "#1f2937" : isFirst ? "#3b82f6" : "rgba(31,41,55,0.85)";
      const fontSize = isLast ? "12px" : "11px";
      const padding = isLast ? "5px 9px" : "3px 7px";

      const overlay = new window.kakao.maps.CustomOverlay({
        position: p,
        content: `
          <div style="
            transform: translate(10px, -50%);
            background: ${bg};
            color: white;
            font-size: ${fontSize};
            font-weight: 600;
            padding: ${padding};
            border-radius: 4px;
            white-space: nowrap;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            pointer-events: none;
          ">${label}</div>
        `,
        yAnchor: 0.5,
        xAnchor: 0,
        zIndex: isLast ? 7 : 6,
      });
      overlay.setMap(map);
      labelOverlaysRef.current.push(overlay);
    });
  }, [map, active, points, clearOverlays]);

  // ─────────────────────────────────────────────
  // 컨트롤 핸들러
  // ─────────────────────────────────────────────
  const handleUndo = () => setPoints((prev) => prev.slice(0, -1));
  const handleReset = () => setPoints([]);

  // ─────────────────────────────────────────────
  // 화면 출력
  // ─────────────────────────────────────────────
  if (!active) return null;

  // 현재 누적 거리 (점 배열에서 직접 계산 — 렌더 시점에 항상 최신값 보장)
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    totalMeters += haversineMeters(a.getLat(), a.getLng(), b.getLat(), b.getLng());
  }
  const totalText = formatDistance(totalMeters);

  return (
    <div className="absolute bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-24px)] md:w-auto max-w-md">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-3">
        {/* 안내 + 누적 거리 */}
        <div className="flex items-center gap-2">
          <span className="text-base">📏</span>
          <div>
            <div className="text-[11px] text-gray-500 leading-tight">
              좌클릭: 점 추가 · 우클릭: 종료
            </div>
            <div className="text-sm font-bold text-gray-900 leading-tight">
              총 {totalText}
            </div>
          </div>
        </div>

        <div className="w-px h-8 bg-gray-200" />

        {/* 컨트롤 버튼 */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={points.length === 0}
          className="text-xs px-2.5 py-1.5 rounded-md border border-gray-300
                     hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↶ 되돌리기
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={points.length === 0}
          className="text-xs px-2.5 py-1.5 rounded-md border border-gray-300
                     hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🗑 초기화
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-md bg-blue-500 text-white
                     hover:bg-blue-600 font-medium"
        >
          완료
        </button>
      </div>
    </div>
  );
}
