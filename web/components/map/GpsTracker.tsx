"use client";

/**
 * 실시간 GPS 위치 추적 — 카카오 지도 위에 표시.
 *
 * 기능:
 *   1. 파란 점 + 펄스 링 (현재 위치)
 *   2. 방향 화살표 (heading — 이동 중일 때)
 *   3. 이동 궤적 (Polyline)
 *   4. 정확도 원 (50m 이상일 때)
 *   5. 좌하단 정보 패널 (속도, 정확도, 좌표)
 *
 * 100% 클라이언트 사이드 — 서버 통신 없음.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  map: any;
  active: boolean;
  autoFollow: boolean;
  onAutoFollowChange: (v: boolean) => void;
  onError?: (msg: string) => void;
  onFirstFix?: () => void;
}

const MAX_TRAIL_POINTS = 5000;

export default function GpsTracker({
  map,
  active,
  autoFollow,
  onAutoFollowChange,
  onError,
  onFirstFix,
}: Props) {
  // 정보 패널용 상태
  const [gpsInfo, setGpsInfo] = useState<{
    speed: number | null;
    heading: number | null;
    accuracy: number;
    lat: number;
    lng: number;
  } | null>(null);

  // 모든 ref를 하나로 — cleanup을 안정적으로 처리
  const stateRef = useRef({
    watchId: null as number | null,
    overlay: null as any,
    headingOverlay: null as any,
    headingEl: null as HTMLElement | null,
    accuracyCircle: null as any,
    trailLine: null as any,
    trailPath: [] as any[],
    firstFix: false,
    autoFollow: true,
  });
  stateRef.current.autoFollow = autoFollow;

  // 콜백 refs — effect 의존성을 안정화
  const onAutoFollowChangeRef = useRef(onAutoFollowChange);
  onAutoFollowChangeRef.current = onAutoFollowChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onFirstFixRef = useRef(onFirstFix);
  onFirstFixRef.current = onFirstFix;

  // 사용자가 지도를 드래그하면 autoFollow 해제
  useEffect(() => {
    if (!map || !active) return;
    const handler = () => {
      if (stateRef.current.autoFollow) {
        onAutoFollowChangeRef.current(false);
      }
    };
    window.kakao.maps.event.addListener(map, "dragstart", handler);
    return () => {
      window.kakao.maps.event.removeListener(map, "dragstart", handler);
    };
  }, [map, active]);

  // ── 핵심 effect: GPS watch 관리 ──
  useEffect(() => {
    const s = stateRef.current;

    // cleanup 함수
    function cleanup() {
      if (s.watchId != null) {
        navigator.geolocation.clearWatch(s.watchId);
        s.watchId = null;
      }
      if (s.overlay) { s.overlay.setMap(null); s.overlay = null; }
      if (s.headingOverlay) { s.headingOverlay.setMap(null); s.headingOverlay = null; s.headingEl = null; }
      if (s.accuracyCircle) { s.accuracyCircle.setMap(null); s.accuracyCircle = null; }
      if (s.trailLine) { s.trailLine.setMap(null); s.trailLine = null; }
      s.trailPath = [];
      s.firstFix = false;
    }

    if (!active || !map) {
      cleanup();
      setGpsInfo(null);
      return cleanup;
    }

    if (!navigator.geolocation) {
      onErrorRef.current?.("이 브라우저에서는 위치 서비스를 지원하지 않아요.");
      return cleanup;
    }

    // ── 파란 점 오버레이 생성 ──
    const dotHtml = `
      <div style="position:relative;width:0;height:0;pointer-events:none;">
        <div style="
          position:absolute;left:-20px;top:-20px;
          width:40px;height:40px;border-radius:50%;
          background:rgba(66,133,244,0.15);
          border:1.5px solid rgba(66,133,244,0.3);
          animation:gpsRipple 3s ease-out infinite;
        "></div>
        <div style="
          position:absolute;left:-8px;top:-8px;
          width:16px;height:16px;border-radius:50%;
          background:#4285f4;
          border:3px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
        "></div>
        <style>
          @keyframes gpsRipple {
            0% { transform:scale(0.8); opacity:1; }
            100% { transform:scale(2.5); opacity:0; }
          }
        </style>
      </div>`;

    s.overlay = new window.kakao.maps.CustomOverlay({
      position: map.getCenter(),
      content: dotHtml,
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 200,
    });
    s.overlay.setMap(map);

    // ── 방향 화살표 오버레이 생성 ──
    const wrapper = document.createElement("div");
    const arrow = document.createElement("div");
    arrow.style.cssText =
      "position:absolute;left:-12px;top:-30px;width:24px;height:24px;pointer-events:none;transition:transform 0.3s ease;";
    arrow.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L8 14 L12 11 L16 14 Z" fill="#4285f4" stroke="white" stroke-width="1"/>
    </svg>`;
    wrapper.appendChild(arrow);
    s.headingEl = arrow;

    s.headingOverlay = new window.kakao.maps.CustomOverlay({
      position: map.getCenter(),
      content: wrapper,
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 201,
    });
    // 처음에는 숨김

    // ── watchPosition 시작 ──
    s.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        const latlng = new window.kakao.maps.LatLng(latitude, longitude);

        // 파란 점 이동
        if (s.overlay) s.overlay.setPosition(latlng);

        // 정확도 원
        if (s.accuracyCircle) { s.accuracyCircle.setMap(null); s.accuracyCircle = null; }
        if (accuracy > 50) {
          s.accuracyCircle = new window.kakao.maps.Circle({
            center: latlng,
            radius: accuracy,
            strokeWeight: 1,
            strokeColor: "#4285f4",
            strokeOpacity: 0.3,
            fillColor: "#4285f4",
            fillOpacity: 0.08,
          });
          s.accuracyCircle.setMap(map);
        }

        // 방향 화살표
        if (heading != null && s.headingOverlay) {
          s.headingOverlay.setPosition(latlng);
          s.headingOverlay.setMap(map);
          if (s.headingEl) {
            s.headingEl.style.transform = `rotate(${heading}deg)`;
          }
        } else if (s.headingOverlay) {
          s.headingOverlay.setMap(null);
        }

        // 이동 궤적
        s.trailPath.push(latlng);
        if (s.trailPath.length > MAX_TRAIL_POINTS) {
          s.trailPath = s.trailPath.slice(-MAX_TRAIL_POINTS);
        }
        if (s.trailPath.length >= 2) {
          if (s.trailLine) s.trailLine.setMap(null);
          s.trailLine = new window.kakao.maps.Polyline({
            path: s.trailPath,
            strokeWeight: 4,
            strokeColor: "#4285f4",
            strokeOpacity: 0.5,
            strokeStyle: "solid",
          });
          s.trailLine.setMap(map);
        }

        // 정보 패널
        setGpsInfo({ speed, heading, accuracy, lat: latitude, lng: longitude });

        // 첫 위치
        if (!s.firstFix) {
          s.firstFix = true;
          map.setCenter(latlng);
          map.setLevel(4, { animate: true });
          onFirstFixRef.current?.();
        } else if (s.autoFollow) {
          map.panTo(latlng);
        }
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: "위치 권한을 허용해 주세요. (브라우저 설정에서 변경 가능)",
          2: "현재 위치를 확인할 수 없어요. GPS 신호를 확인해 주세요.",
          3: "위치 확인이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.",
        };
        onErrorRef.current?.(msgs[err.code] ?? "위치 오류가 발생했어요.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      }
    );

    return cleanup;
  }, [active, map]);

  // autoFollow 복원 시 현재 위치로 이동
  useEffect(() => {
    const s = stateRef.current;
    if (active && autoFollow && map && s.overlay) {
      const pos = s.overlay.getPosition();
      if (pos) map.panTo(pos);
    }
  }, [active, autoFollow, map]);

  // ── 정보 패널 렌더링 ──
  if (!active || !gpsInfo) return null;

  const speedKmh = gpsInfo.speed != null ? gpsInfo.speed * 3.6 : null;
  const headingDir = gpsInfo.heading != null ? degToDir(gpsInfo.heading) : null;

  return (
    <div className="absolute bottom-4 right-4 z-20 bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 px-3 py-2.5 text-xs space-y-1.5 min-w-[160px] kepco-slide-up">
      <div className="flex items-center gap-1.5 text-blue-600 font-bold text-[11px]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
        </span>
        GPS 추적 중
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-500">속도</span>
        <span className="font-bold text-gray-900 tabular-nums">
          {speedKmh != null ? `${speedKmh.toFixed(1)} km/h` : "정지"}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-500">방향</span>
        <span className="font-bold text-gray-900 tabular-nums">
          {headingDir != null ? (
            <>
              {headingDir}{" "}
              <span className="text-gray-400">({gpsInfo.heading!.toFixed(0)}°)</span>
            </>
          ) : (
            "-"
          )}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-500">정확도</span>
        <span className={`font-bold tabular-nums ${
          gpsInfo.accuracy <= 10
            ? "text-green-600"
            : gpsInfo.accuracy <= 50
              ? "text-yellow-600"
              : "text-red-600"
        }`}>
          ±{gpsInfo.accuracy.toFixed(0)}m
        </span>
      </div>

      <div className="pt-1 border-t border-gray-100">
        <div className="flex items-center justify-between text-gray-400">
          <span>위도</span>
          <span className="tabular-nums">{gpsInfo.lat.toFixed(6)}</span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>경도</span>
          <span className="tabular-nums">{gpsInfo.lng.toFixed(6)}</span>
        </div>
      </div>
    </div>
  );
}

function degToDir(deg: number): string {
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return dirs[Math.round(deg / 45) % 8];
}
