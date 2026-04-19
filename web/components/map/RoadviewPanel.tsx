"use client";

/**
 * 카카오 로드뷰 패널 — 데스크톱: 우측 절반, 모바일: 전체화면 모달.
 *
 * 동작:
 *   1. position(좌표) 받으면 RoadviewClient.getNearestPanoId 로 가까운 파노 검색
 *   2. setPanoId 로 로드뷰 로드
 *   3. 로드뷰 안 화살표 이동 → position_changed 이벤트 → onPositionChange 콜백
 *      → MapClient 가 지도 위 위치 마커도 동기화
 *   4. 100m 안에 파노가 없으면 "로드뷰 없음" 안내
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  /** 보고있는 좌표 — 변경 시 가장 가까운 파노 다시 로드 */
  position: { lat: number; lng: number };
  /** 패널 닫기 (X 버튼) */
  onClose: () => void;
  /** 로드뷰 안에서 이동/회전할 때 호출 — 지도 위 위치 마커 + 시야 방향 동기화 */
  onPositionChange?: (lat: number, lng: number, pan: number) => void;
  /** 모바일 여부 — true면 전체화면 모달 스타일 */
  isMobile?: boolean;
}

declare global {
  interface Window {
    kakao: any;
  }
}

export default function RoadviewPanel({
  position,
  onClose,
  onPositionChange,
  isMobile,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const roadviewRef = useRef<any>(null);
  const clientRef = useRef<any>(null);
  // 같은 파노에 대한 setPanoId 중복 호출 방지 (외부 prop 동기화 → 무한 루프 차단)
  const lastPanoIdRef = useRef<number | null>(null);
  const [noPano, setNoPano] = useState(false);

  // 로드뷰 인스턴스 1회 생성
  useEffect(() => {
    if (!containerRef.current || !window.kakao?.maps) return;
    const kakao = window.kakao;
    roadviewRef.current = new kakao.maps.Roadview(containerRef.current);
    clientRef.current = new kakao.maps.RoadviewClient();

    // viewpoint_changed 는 드래그할 때마다 발화 → throttle 로 ~30fps 제한
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const fireChange = () => {
      const pos = roadviewRef.current?.getPosition();
      const vp = roadviewRef.current?.getViewpoint();
      if (!pos || !vp) return;
      onPositionChange?.(pos.getLat(), pos.getLng(), vp.pan ?? 0);
    };
    const fireChangeThrottled = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        fireChange();
      }, 33);
    };

    const handlePositionChanged = () => {
      // setPanoId 든 화살표 이동이든 항상 실제 파노 위치를 상위에 알림.
      // 무한 루프는 lastPanoIdRef 비교로 차단.
      fireChange();
    };
    kakao.maps.event.addListener(
      roadviewRef.current,
      "position_changed",
      handlePositionChanged,
    );
    kakao.maps.event.addListener(
      roadviewRef.current,
      "viewpoint_changed",
      fireChangeThrottled,
    );
    // 파노 로드 직후 첫 시야각 동기화
    kakao.maps.event.addListener(roadviewRef.current, "init", fireChange);

    return () => {
      if (throttleTimer) clearTimeout(throttleTimer);
      kakao.maps.event.removeListener(
        roadviewRef.current,
        "position_changed",
        handlePositionChanged,
      );
      kakao.maps.event.removeListener(
        roadviewRef.current,
        "viewpoint_changed",
        fireChangeThrottled,
      );
      kakao.maps.event.removeListener(roadviewRef.current, "init", fireChange);
      roadviewRef.current = null;
      clientRef.current = null;
    };
    // onPositionChange 가 매번 새 함수면 cleanup 폭주 — 의도적으로 deps 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // position 변경 → 가까운 파노 검색 후 setPanoId.
  // 이미 같은 파노를 보고 있으면 setPanoId 호출 자체를 스킵 → 무한 루프 차단.
  useEffect(() => {
    if (!roadviewRef.current || !clientRef.current || !window.kakao?.maps) return;
    const kakao = window.kakao;
    const latlng = new kakao.maps.LatLng(position.lat, position.lng);
    clientRef.current.getNearestPanoId(latlng, 50, (panoId: number | null) => {
      if (!panoId) {
        setNoPano(true);
        return;
      }
      setNoPano(false);
      if (panoId === lastPanoIdRef.current) return; // 동일 파노 → 스킵
      lastPanoIdRef.current = panoId;
      roadviewRef.current.setPanoId(panoId, latlng);
    });
  }, [position.lat, position.lng]);

  return (
    <div
      className={
        isMobile
          ? "fixed inset-0 z-[60] bg-black"
          : "absolute inset-0 bg-black"
      }
    >
      <div ref={containerRef} className="w-full h-full" />

      {noPano && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 rounded-lg shadow-lg px-5 py-4 text-center max-w-xs">
            <div className="text-2xl mb-2">📷</div>
            <div className="text-sm font-semibold text-gray-800 mb-1">
              로드뷰 없음
            </div>
            <div className="text-xs text-gray-600 leading-relaxed">
              이 위치 근처에 촬영된 로드뷰가 없습니다.
              <br />
              파란선 위 다른 지점을 클릭해 보세요.
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        title="로드뷰 닫기"
        className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/95 hover:bg-white shadow border border-gray-300 flex items-center justify-center text-gray-700 text-base font-bold transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
