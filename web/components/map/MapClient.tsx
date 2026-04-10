"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useIsMobile } from "@/lib/useIsMobile";
import KakaoMap from "./KakaoMap";
import Sidebar from "./Sidebar";
import LocationSummaryCard from "./LocationSummaryCard";
import LocationDetailModal from "./LocationDetailModal";
import MapToolbar from "./MapToolbar";
import DistanceTool from "./DistanceTool";
import SearchPanel from "./SearchPanel";
import MapLegend from "./MapLegend";
import Toast from "./Toast";
import TopRemainingList from "./TopRemainingList";
import ComparePanel, { getChangeDirection, type ChangeDirection } from "./ComparePanel";
import GpsTracker from "./GpsTracker";
import type { CompareRow } from "@/app/api/compare/route";
import type { SearchPick } from "./SearchResultList";
import {
  emptyFilters,
  type ColumnFilters,
  type MapSummaryRow,
  type KepcoDataRow,
  type MarkerColor,
} from "@/lib/types";
import { colorForMarker } from "@/lib/markerColor";
import { matchesVolumeFilter, hasAnyFilter } from "@/lib/filterUtil";

interface Props {
  isAdmin: boolean;
  email: string;
}

export default function MapClient({ isAdmin, email }: Props) {
  const [allRows, setAllRows] = useState<MapSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ColumnFilters>(emptyFilters());
  const [colorFilter] = useState<Set<MarkerColor>>(
    new Set(["red", "yellow", "green", "blue"])
  );
  const [fitBoundsKey, setFitBoundsKey] = useState(0);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 모바일 첫 진입 시 사이드바 닫기
  const mobileInitRef = useRef(false);
  useEffect(() => {
    if (isMobile && !mobileInitRef.current) {
      mobileInitRef.current = true;
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // 마커 클릭 → 마을 상세 데이터
  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<KepcoDataRow[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailCache] = useState<Map<string, KepcoDataRow[]>>(new Map());

  // 편의 도구: 카카오 지도 인스턴스 + 거리재기 모드 + 유망부지 패널
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [measureActive, setMeasureActive] = useState(false);
  const [topListOpen, setTopListOpen] = useState(false);
  const [mapType, setMapType] = useState<"roadmap" | "skyview" | "hybrid">("roadmap");
  const [zoomLevel, setZoomLevel] = useState<number | undefined>(undefined);

  // 비교 모드
  const [compareActive, setCompareActive] = useState(false);
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);

  // GPS 실시간 추적
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsAutoFollow, setGpsAutoFollow] = useState(true);

  // 사이드바 토글 시 카카오맵 relayout (컨테이너 크기 변경 반영)
  useEffect(() => {
    if (!mapInstance) return;
    const timer = setTimeout(() => {
      mapInstance.relayout();
    }, 350);
    return () => clearTimeout(timer);
  }, [sidebarOpen, mapInstance]);

  // 지번 핀 마커 — 같은 마을 내 클릭한 지번들 누적 표시
  const [jibunPinCount, setJibunPinCount] = useState(0);
  // 마을별 지번 좌표 캐시 — 마을 재선택 시 즉시 복원
  const [jibunCache] = useState<Map<string, { lat: number; lng: number; jibun: string }[]>>(new Map());

  // 범용 토스트 (공유 링크 등)
  const [simpleToast, setSimpleToast] = useState<string | null>(null);

  // 검색 결과가 필터에 가려졌을 때 자동 해제하면서 띄우는 토스트.
  // filterSnapshot은 "되돌리기" 시 복원할 이전 필터.
  const [toast, setToast] = useState<{
    message: string;
    snapshot: ColumnFilters;
  } | null>(null);
  // 측정 모드 중 마커 클릭 → DistanceTool에 점 추가를 위임할 핸들러
  const measureAddPointRef = useRef<((latlng: any) => void) | null>(null);
  // 콜백을 effect 의존성에서 안정적으로 쓰기 위해 useCallback으로 고정
  const registerMeasureAddPoint = useCallback(
    (fn: ((latlng: any) => void) | null) => {
      measureAddPointRef.current = fn;
    },
    []
  );

  // 1. 페이지 진입 시 Light 데이터 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/map-summary")
      .then(async (res) => {
        if (!res.ok) {
          // 사용자 친화적 메시지 — 기술 용어(HTTP 코드) 대신 행동 안내
          throw new Error(
            "지도 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          );
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setAllRows(data.rows ?? []);
        setFitBoundsKey((k) => k + 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err?.message || err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 줌 레벨 실시간 추적
  useEffect(() => {
    if (!mapInstance) return;
    setZoomLevel(mapInstance.getLevel());
    const handler = () => setZoomLevel(mapInstance.getLevel());
    window.kakao.maps.event.addListener(mapInstance, "zoom_changed", handler);
    return () => {
      window.kakao.maps.event.removeListener(mapInstance, "zoom_changed", handler);
    };
  }, [mapInstance]);

  // 공유 링크 복원 — 데이터 로드 + 맵 준비 후 URL 파라미터 적용 (1회)
  const sharedAppliedRef = useRef(false);
  useEffect(() => {
    if (sharedAppliedRef.current || !mapInstance || allRows.length === 0) return;
    sharedAppliedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const lat = params.get("lat");
    const lng = params.get("lng");
    const zoom = params.get("zoom");

    if (lat && lng) {
      const pos = new window.kakao.maps.LatLng(parseFloat(lat), parseFloat(lng));
      mapInstance.setCenter(pos);
      if (zoom) mapInstance.setLevel(parseInt(zoom, 10));
    }

    // 필터 복원
    const filterKeys: (keyof ColumnFilters)[] = [
      "addr_do", "addr_gu", "addr_dong", "addr_li",
      "subst_nm", "dl_nm", "cap_subst", "cap_mtr", "cap_dl",
    ];
    let hasFilter = false;
    const restored = emptyFilters();
    for (const key of filterKeys) {
      const val = params.get(key);
      if (val) {
        restored[key] = new Set(val.split(","));
        hasFilter = true;
      }
    }
    if (hasFilter) {
      setFilters(restored);
    }

    // 선택된 마커 복원
    const addr = params.get("addr");
    if (addr) {
      setSelectedAddr(addr);
      setDetailLoading(true);
      fetch(`/api/location?addr=${encodeURIComponent(addr)}`)
        .then((res) => res.json())
        .then((data) => {
          const rows = data.rows ?? [];
          detailCache.set(addr, rows);
          setSelectedRows(rows);
        })
        .catch(() => {})
        .finally(() => setDetailLoading(false));
    }

    // URL 정리 — 파라미터 제거해서 깔끔하게
    if (params.toString()) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [mapInstance, allRows, detailCache]);

  // 2. 필터 적용 (메모리)
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      // 1차: 여유용량 (공용 유틸 사용 — FilterPanel과 동일 로직)
      if (!matchesVolumeFilter(r.subst_no_cap, r.total, filters.cap_subst)) return false;
      if (!matchesVolumeFilter(r.mtr_no_cap, r.total, filters.cap_mtr)) return false;
      if (!matchesVolumeFilter(r.dl_no_cap, r.total, filters.cap_dl)) return false;

      // 2차: 지역/설비
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do)))
        return false;
      if (filters.addr_gu.size > 0 && (!r.addr_gu || !filters.addr_gu.has(r.addr_gu)))
        return false;
      if (filters.addr_dong.size > 0 && (!r.addr_dong || !filters.addr_dong.has(r.addr_dong)))
        return false;
      if (filters.addr_li.size > 0 && (!r.addr_li || !filters.addr_li.has(r.addr_li)))
        return false;
      if (filters.subst_nm.size > 0) {
        const has = r.subst_names?.some((n) => filters.subst_nm.has(n));
        if (!has) return false;
      }
      if (filters.dl_nm.size > 0) {
        const has = r.dl_names?.some((n) => filters.dl_nm.has(n));
        if (!has) return false;
      }
      return true;
    });
  }, [allRows, filters]);

  // 3. 마을(geocode_address) 상세 데이터 fetch + 카드 열기
  //    마커 클릭 / 검색 결과 클릭 양쪽이 공유하는 핵심 로직
  const openLocationDetail = useCallback(
    async (addr: string) => {
      // 다른 마을이면 기존 핀 제거
      const villageChanged = addr !== selectedAddr;
      if (villageChanged) {
        for (const pin of jibunPinsRef.current) {
          pin.overlay.setMap(null);
          if (pin.line) pin.line.setMap(null);
        }
        jibunPinsRef.current = [];
        setJibunPinCount(0);
        if (jibunBoundCircleRef.current) {
          jibunBoundCircleRef.current.setMap(null);
          jibunBoundCircleRef.current = null;
        }
      }
      setSelectedAddr(addr);
      setDetailModalOpen(false);

      // 캐시 확인 — 이미 받아둔 마을이면 재호출 X (호출 최소화 원칙)
      const cached = detailCache.get(addr);
      if (cached) {
        setSelectedRows(cached);
        // detailCache가 있으므로 핀 복원 가능
        if ((villageChanged || jibunPinsRef.current.length === 0) && mapInstance) {
          restoreCachedPins(addr, mapInstance);
        }
        return;
      }

      setSelectedRows(null);
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/location?addr=${encodeURIComponent(addr)}`);
        if (!res.ok) {
          throw new Error("마을 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
        const data = await res.json();
        const rows: KepcoDataRow[] = data.rows ?? [];
        detailCache.set(addr, rows);
        setSelectedRows(rows);
        // 데이터 로드 완료 후 핀 복원
        if (mapInstance) restoreCachedPins(addr, mapInstance);
      } catch (err) {
        console.error("[location] 조회 실패", err);
      } finally {
        setDetailLoading(false);
      }
    },
    [detailCache, selectedAddr, mapInstance]
  );

  // 마커 클릭 (측정 모드일 때는 KakaoMap이 직접 처리하므로 여기로 안 옴)
  const handleMarkerClick = useCallback(
    async (row: MapSummaryRow) => {
      await openLocationDetail(row.geocode_address);
    },
    [openLocationDetail]
  );

  // 사이드바 TOP 유망 부지 클릭 — 지도 이동 + 상세 카드 열기
  const handleSidebarPick = useCallback(
    async (row: MapSummaryRow) => {
      if (mapInstance && row.lat != null && row.lng != null) {
        const pos = new window.kakao.maps.LatLng(row.lat, row.lng);
        mapInstance.setCenter(pos);
        mapInstance.setLevel(5);
      }
      await openLocationDetail(row.geocode_address);
    },
    [mapInstance, openLocationDetail]
  );

  // 4. 검색 결과 클릭 → 지도 이동 + 마커 강조 + (가려졌으면) 필터 자동 해제
  //
  //    동작 흐름:
  //    1) 좌표로 지도 이동
  //    2) 해당 마을의 마커를 강조(selectedAddr) — 마커 클릭과 동일한 시각 피드백
  //    3) 그 마을이 현재 filteredRows에 있는지 검사
  //    4) 없으면(=필터에 가려짐) 필터를 비우고 토스트로 알림
  const handleSearchPick = useCallback(
    (pick: SearchPick) => {
      if (!mapInstance) return;

      // 좌표·geocode_address 모두 검색 결과에서 직접 사용 (같은 DB)
      const targetAddr = pick.row.geocode_address;
      const lat = pick.row.lat;
      const lng = pick.row.lng;
      if (lat == null || lng == null) return;

      // GPS 추적 중이면 autoFollow 해제 — 검색 이동을 GPS가 덮어쓰지 않도록
      if (gpsActive && gpsAutoFollow) {
        setGpsAutoFollow(false);
      }

      // 지도 이동 — setCenter → setLevel 순서, 애니메이션 없이 즉시 이동
      // (setLevel animate: true와 setCenter를 동시 호출하면 줌 애니메이션이
      //  center를 재조정하면서 위치가 어긋날 수 있음)
      const pos = new window.kakao.maps.LatLng(lat, lng);
      mapInstance.setCenter(pos);
      mapInstance.setLevel(5);

      // 데이터 fetch + 시각 피드백
      if (targetAddr) {
        openLocationDetail(targetAddr);
      }

      // 필터에 가려졌는지 검사
      const isVisible = targetAddr
        ? filteredRows.some((r) => r.geocode_address === targetAddr)
        : true;

      if (!isVisible && hasAnyFilter(filters)) {
        // 안내용 마을 이름
        const name = [
          pick.row.addr_do,
          pick.row.addr_si,
          pick.row.addr_gu,
          pick.row.addr_dong,
          pick.row.addr_li,
        ]
          .filter(Boolean)
          .join(" ");

        // 스냅샷 저장 후 필터 초기화
        const snapshot = filters;
        setFilters(emptyFilters());
        setToast({
          message: `'${name}'를 보기 위해 필터를 해제했어요`,
          snapshot,
        });
      }
    },
    [mapInstance, filteredRows, filters, openLocationDetail, gpsActive, gpsAutoFollow]
  );

  // 5. 공유 링크 생성 + 클립보드 복사
  const handleShare = useCallback(() => {
    if (!mapInstance) return;

    const center = mapInstance.getCenter();
    const params = new URLSearchParams();
    params.set("lat", center.getLat().toFixed(6));
    params.set("lng", center.getLng().toFixed(6));
    params.set("zoom", String(mapInstance.getLevel()));

    // 필터 — 값이 있는 것만 직렬화
    const filterKeys: (keyof ColumnFilters)[] = [
      "addr_do", "addr_gu", "addr_dong", "addr_li",
      "subst_nm", "dl_nm", "cap_subst", "cap_mtr", "cap_dl",
    ];
    for (const key of filterKeys) {
      const s = filters[key];
      if (s.size > 0) {
        params.set(key, [...s].join(","));
      }
    }

    // 선택된 마커
    if (selectedAddr) {
      params.set("addr", selectedAddr);
    }

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setSimpleToast("링크가 복사되었습니다");
    }).catch(() => {
      setSimpleToast("링크 복사에 실패했어요");
    });
  }, [mapInstance, filters, selectedAddr]);

  // 6. 지번 핀 — 같은 마을 내 여러 지번 누적 표시
  const jibunPinsRef = useRef<{ overlay: any; line: any; jibun: string; lat: number; lng: number }[]>([]);
  const jibunBoundCircleRef = useRef<any>(null);

  /** 마을 마커 + 핀 전부를 감싸는 최소 외접원 (Welzl 알고리즘) */
  function updateBoundCircle(map: any, villageAddr?: string) {
    // 기존 원 제거
    if (jibunBoundCircleRef.current) {
      jibunBoundCircleRef.current.setMap(null);
      jibunBoundCircleRef.current = null;
    }

    if (jibunPinsRef.current.length === 0) return;

    // 좌표 수집: 핀들 + 마을 마커
    const points: { lat: number; lng: number }[] = jibunPinsRef.current.map((p) => ({ lat: p.lat, lng: p.lng }));
    const addr = villageAddr ?? selectedAddr;
    const village = allRows.find((r) => r.geocode_address === addr);
    if (village) points.push({ lat: village.lat, lng: village.lng });

    // --- 최소 외접원 (Welzl) — 위경도 → 미터 근사 ---
    const REF_LAT = points[0].lat;
    const M_PER_LAT = 111_320;
    const M_PER_LNG = 111_320 * Math.cos((REF_LAT * Math.PI) / 180);
    const toXY = (p: { lat: number; lng: number }) => ({
      x: (p.lng - points[0].lng) * M_PER_LNG,
      y: (p.lat - points[0].lat) * M_PER_LAT,
    });
    type Pt = { x: number; y: number };

    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

    const circleFrom1 = (a: Pt): { cx: number; cy: number; r: number } => ({ cx: a.x, cy: a.y, r: 0 });
    const circleFrom2 = (a: Pt, b: Pt) => ({
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      r: dist(a, b) / 2,
    });
    const circleFrom3 = (a: Pt, b: Pt, c: Pt) => {
      const ax = a.x, ay = a.y, bx = b.x, by = b.y, cx2 = c.x, cy2 = c.y;
      const D = 2 * (ax * (by - cy2) + bx * (cy2 - ay) + cx2 * (ay - by));
      if (Math.abs(D) < 1e-10) return circleFrom2(a, dist(a, b) > dist(a, c) ? b : c);
      const ux = ((ax * ax + ay * ay) * (by - cy2) + (bx * bx + by * by) * (cy2 - ay) + (cx2 * cx2 + cy2 * cy2) * (ay - by)) / D;
      const uy = ((ax * ax + ay * ay) * (cx2 - bx) + (bx * bx + by * by) * (ax - cx2) + (cx2 * cx2 + cy2 * cy2) * (bx - ax)) / D;
      return { cx: ux, cy: uy, r: dist({ x: ux, y: uy }, a) };
    };

    const inside = (c: { cx: number; cy: number; r: number }, p: Pt) =>
      dist({ x: c.cx, y: c.cy }, p) <= c.r + 1e-6;

    // Welzl iterative (셔플 + 경계 포인트 최대 3개)
    const pts = points.map(toXY);
    // 셔플
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }

    let circle = circleFrom1(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      if (!inside(circle, pts[i])) {
        circle = circleFrom1(pts[i]);
        for (let j = 0; j < i; j++) {
          if (!inside(circle, pts[j])) {
            circle = circleFrom2(pts[i], pts[j]);
            for (let k = 0; k < j; k++) {
              if (!inside(circle, pts[k])) {
                circle = circleFrom3(pts[i], pts[j], pts[k]);
              }
            }
          }
        }
      }
    }

    // 미터 좌표 → 위경도 복원
    const centerLat = points[0].lat + circle.cy / M_PER_LAT;
    const centerLng = points[0].lng + circle.cx / M_PER_LNG;
    const radius = Math.max(circle.r * 1.05, 30); // 5% 패딩, 최소 30m

    const center = new window.kakao.maps.LatLng(centerLat, centerLng);
    jibunBoundCircleRef.current = new window.kakao.maps.Circle({
      center,
      radius,
      strokeWeight: 1.5,
      strokeColor: "#ef4444",
      strokeOpacity: 0.35,
      strokeStyle: "dashed",
      fillColor: "#ef4444",
      fillOpacity: 0.06,
    });
    jibunBoundCircleRef.current.setMap(map);
  }

  /** 지도 위 핀 오버레이 + 연결선 1개 생성 (공통 헬퍼) */
  function createPinOverlay(
    map: any,
    lat: number,
    lng: number,
    jibun: string,
    villageLat?: number | null,
    villageLng?: number | null,
  ) {
    const pos = new window.kakao.maps.LatLng(lat, lng);
    const pinHtml = `
      <div style="position:relative;width:0;height:0;pointer-events:none;">
        <div style="
          position:absolute;left:-16px;top:-42px;
          width:32px;height:42px;
          filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        ">
          <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26C32 7.16 24.84 0 16 0z" fill="#e53e3e"/>
            <circle cx="16" cy="16" r="8" fill="white"/>
            <circle cx="16" cy="16" r="5" fill="#e53e3e"/>
          </svg>
        </div>
        <div style="
          position:absolute;left:20px;top:-40px;
          background:white;border:1px solid #e53e3e;
          border-radius:6px;padding:3px 8px;
          font-size:11px;font-weight:bold;color:#c53030;
          white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,0.15);
        ">${jibun}</div>
      </div>`;

    const overlay = new window.kakao.maps.CustomOverlay({
      position: pos, content: pinHtml, yAnchor: 0.5, xAnchor: 0.5, zIndex: 300,
    });
    overlay.setMap(map);

    let line: any = null;
    if (villageLat != null && villageLng != null) {
      const villagePos = new window.kakao.maps.LatLng(villageLat, villageLng);
      line = new window.kakao.maps.Polyline({
        path: [villagePos, pos],
        strokeWeight: 1.5, strokeColor: "#e53e3e", strokeOpacity: 0.4, strokeStyle: "dashed",
      });
      line.setMap(map);
    }
    return { overlay, line, jibun, lat, lng };
  }

  /** 마을의 지번 중 DB에 좌표가 저장된 것만 핀으로 표시 */
  async function restoreCachedPins(addr: string, map: any) {
    // 세션 캐시 히트 → DB 재조회 불필요
    const sessionCached = jibunCache.get(addr);
    if (sessionCached) {
      if (sessionCached.length === 0) return;
      const village = allRows.find((r) => r.geocode_address === addr);
      for (const c of sessionCached) {
        jibunPinsRef.current.push(
          createPinOverlay(map, c.lat, c.lng, c.jibun, village?.lat, village?.lng)
        );
      }
      setJibunPinCount(jibunPinsRef.current.length);
      updateBoundCircle(map, addr);
      return;
    }

    // DB 조회용 prefix 구성 — 기타지역 제거 (저장 형식과 일치시킴)
    const rows = detailCache.get(addr);
    let villagePrefix = addr; // fallback
    if (rows && rows.length > 0) {
      const first = rows[0];
      villagePrefix = [first.addr_do, first.addr_si, first.addr_gu, first.addr_dong, first.addr_li]
        .filter(Boolean)
        .filter((p) => !p!.includes("기타지역"))
        .join(" ");
    }

    try {
      const res = await fetch(
        `/api/geocode-cached?village=${encodeURIComponent(villagePrefix)}`
      );
      const data = await res.json();
      const pins: { jibun: string; lat: number; lng: number }[] = data.pins ?? [];

      // 세션 캐시에 저장 (빈 배열도 저장 → 다음엔 DB 재조회 안 함)
      jibunCache.set(addr, pins);

      if (pins.length === 0) return;
      const village = allRows.find((r) => r.geocode_address === addr);
      for (const p of pins) {
        jibunPinsRef.current.push(
          createPinOverlay(map, p.lat, p.lng, p.jibun, village?.lat, village?.lng)
        );
      }
      setJibunPinCount(jibunPinsRef.current.length);
      updateBoundCircle(map, addr);
    } catch {
      // 조회 실패 시 무시
    }
  }

  const clearJibunPin = useCallback(() => {
    for (const pin of jibunPinsRef.current) {
      pin.overlay.setMap(null);
      if (pin.line) pin.line.setMap(null);
    }
    jibunPinsRef.current = [];
    setJibunPinCount(0);
    if (jibunBoundCircleRef.current) {
      jibunBoundCircleRef.current.setMap(null);
      jibunBoundCircleRef.current = null;
    }
  }, []);

  const handleJibunPin = useCallback(
    async (row: KepcoDataRow) => {
      if (!mapInstance) return;

      // 이미 같은 지번이 표시되어 있으면 무시
      if (jibunPinsRef.current.some((p) => p.jibun === row.addr_jibun)) {
        setSimpleToast(`📍 ${row.addr_jibun}은 이미 표시되어 있어요`);
        return;
      }

      const fullAddr = [
        row.addr_do, row.addr_si, row.addr_gu, row.addr_dong, row.addr_li, row.addr_jibun,
      ]
        .filter(Boolean)
        .filter((p) => !p!.includes("기타지역"))
        .join(" ");

      setDetailModalOpen(false);
      setSimpleToast(`📍 ${row.addr_jibun} 위치를 찾는 중...`);

      try {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(fullAddr)}`);
        const data = await res.json();

        if (data.lat == null || data.lng == null) {
          setSimpleToast(`⚠️ ${row.addr_jibun} 위치를 찾을 수 없어요`);
          return;
        }

        const village = allRows.find((r) => r.geocode_address === row.geocode_address);
        const pin = createPinOverlay(
          mapInstance, data.lat, data.lng, row.addr_jibun || "",
          village?.lat, village?.lng,
        );
        jibunPinsRef.current.push(pin);
        setJibunPinCount(jibunPinsRef.current.length);
        updateBoundCircle(mapInstance, row.geocode_address);

        // 세션 캐시에 저장
        const geoAddr = row.geocode_address;
        const list = jibunCache.get(geoAddr) ?? [];
        list.push({ lat: data.lat, lng: data.lng, jibun: row.addr_jibun || "" });
        jibunCache.set(geoAddr, list);

        mapInstance.panTo(new window.kakao.maps.LatLng(data.lat, data.lng));

        const cnt = jibunPinsRef.current.length;
        setSimpleToast(`📍 ${row.addr_jibun} 표시 (총 ${cnt}개 핀)`);
      } catch {
        setSimpleToast(`⚠️ 위치 조회 중 오류가 발생했어요`);
      }
    },
    [mapInstance, allRows, jibunCache]
  );

  return (
    <div className="flex h-dvh overflow-hidden relative">
      <Sidebar
        isAdmin={isAdmin}
        email={email}
        totalRows={allRows}
        filteredRows={filteredRows}
        filters={filters}
        onFiltersChange={setFilters}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      <main className="flex-1 relative min-w-0">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70">
            <div className="bg-white rounded-lg shadow-lg px-6 py-4 border border-gray-200">
              <div className="text-sm text-gray-700">지도를 불러오는 중...</div>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2.5 rounded-lg shadow-md flex items-center gap-2 max-w-md">
            <span className="text-base">⚠️</span>
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-700 leading-none text-base ml-2"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        )}

        <KakaoMap
          rows={filteredRows}
          colorFilter={colorFilter}
          onMarkerClick={handleMarkerClick}
          fitBoundsKey={fitBoundsKey}
          onMapReady={setMapInstance}
          measureMode={measureActive}
          measureAddPointRef={measureAddPointRef}
          selectedAddr={selectedAddr}
          mapType={mapType}
          compareRows={compareRows}
        />

        {/* 좌상단: 사이드바 열기 버튼 + 범례 */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="bg-white rounded-lg shadow-md border border-gray-200
                         p-2.5 hover:bg-gray-50 transition-colors group self-start"
              aria-label="사이드바 열기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 group-hover:text-gray-900">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          <div className="hidden md:block">
            <MapLegend />
          </div>
        </div>

        {/* 우상단 도구 패널 (거리재기 / 유망 부지 TOP) */}
        <MapToolbar
          measureActive={measureActive}
          onToggleMeasure={() => {
            setMeasureActive((v) => {
              if (!v) setSimpleToast("거리재기 모드 — 지도를 클릭하세요");
              return !v;
            });
          }}
          topListActive={topListOpen}
          onToggleTopList={() => setTopListOpen((v) => !v)}
          compareActive={compareActive}
          onToggleCompare={() => {
            setCompareActive((v) => {
              if (!v) setSimpleToast("용량 변화 비교 모드");
              return !v;
            });
            if (compareActive) setCompareRows([]);
          }}
          gpsActive={gpsActive}
          gpsAutoFollow={gpsAutoFollow}
          onToggleGps={() => {
            if (gpsActive) {
              setGpsActive(false);
            } else {
              setGpsActive(true);
              setGpsAutoFollow(true);
              setSimpleToast("GPS 추적 시작");
            }
          }}
          onGpsRecenter={() => setGpsAutoFollow(true)}
          zoomLevel={zoomLevel}
          mapType={mapType}
          onMapTypeChange={setMapType}
          onZoomIn={() => mapInstance?.setLevel(mapInstance.getLevel() - 1)}
          onZoomOut={() => mapInstance?.setLevel(mapInstance.getLevel() + 1)}
          onShare={handleShare}
        />

        {/* 비교 패널 */}
        {compareActive && (
          <ComparePanel
            onResults={setCompareRows}
            onClose={() => {
              setCompareActive(false);
              setCompareRows([]);
            }}
            onVillageClick={async (addr, lat, lng) => {
              if (mapInstance) {
                const pos = new window.kakao.maps.LatLng(lat, lng);
                mapInstance.setCenter(pos);
                mapInstance.setLevel(5);
              }
              await openLocationDetail(addr);
            }}
          />
        )}

        {/* 유망 부지 TOP 플로팅 패널 — open 일 때만 마운트 */}
        {topListOpen && (
          <TopRemainingList
            rows={filteredRows}
            onPick={handleSidebarPick}
            onClose={() => setTopListOpen(false)}
            topN={10}
          />
        )}

        {/* 거리재기 — active일 때만 클릭 리스너/오버레이 활성 */}
        <DistanceTool
          map={mapInstance}
          active={measureActive}
          onClose={() => setMeasureActive(false)}
          registerAddPoint={registerMeasureAddPoint}
        />

        {/* GPS 실시간 위치 추적 */}
        <GpsTracker
          map={mapInstance}
          active={gpsActive}
          autoFollow={gpsAutoFollow}
          onAutoFollowChange={setGpsAutoFollow}
          onError={(msg) => setError(msg)}
        />

        {/* 화면 하단 검색 패널 (주소·지번 → 업로드된 데이터 검색) */}
        <SearchPanel
          onPick={handleSearchPick}
          onJibunPin={handleJibunPin}
          onFocus={() => {
            setSelectedAddr(null);
            setSelectedRows(null);
            clearJibunPin();
          }}
        />

        {/* 필터 자동 해제 시 토스트 (되돌리기 가능) */}
        {toast && (
          <Toast
            message={toast.message}
            actionLabel="되돌리기"
            onAction={() => setFilters(toast.snapshot)}
            onClose={() => setToast(null)}
          />
        )}

        {/* 범용 토스트 (공유 링크 등) */}
        {simpleToast && (
          <Toast
            message={simpleToast}
            onClose={() => setSimpleToast(null)}
            duration={3000}
          />
        )}

        {/* 마커 클릭 시 카드 */}
        {selectedAddr && (
          <LocationSummaryCard
            key={selectedAddr}
            rows={selectedRows}
            loading={detailLoading}
            onShowDetail={() => setDetailModalOpen(true)}
            onClose={() => {
              setSelectedAddr(null);
              setSelectedRows(null);
              setDetailModalOpen(false);
              clearJibunPin();
            }}
            compareRows={compareRows.filter((r) => r.geocode_address === selectedAddr)}
          />
        )}

        {/* 상세 모달 */}
        {detailModalOpen && selectedRows && (
          <LocationDetailModal
            rows={selectedRows}
            onClose={() => {
              setDetailModalOpen(false);
            }}
            onJibunPin={handleJibunPin}
          />
        )}

        {/* 빈 데이터 안내 — 관리자/일반사용자별 차별화 */}
        {!loading && allRows.length === 0 && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-xl shadow-lg px-8 py-6 border border-gray-200 text-center pointer-events-auto max-w-md">
              <div className="text-4xl mb-3">📭</div>
              <div className="text-base font-semibold text-gray-900 mb-2">
                아직 보여드릴 데이터가 없어요
              </div>
              {isAdmin ? (
                <>
                  <div className="text-xs text-gray-600 leading-relaxed mb-4">
                    KEPCO 여유용량 엑셀 파일을 업로드하시면<br />
                    바로 지도에 표시됩니다.
                  </div>
                  <Link
                    href="/admin/upload"
                    className="inline-block bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-md transition-colors"
                  >
                    📤 지금 엑셀 업로드하기
                  </Link>
                </>
              ) : (
                <div className="text-xs text-gray-600 leading-relaxed">
                  관리자가 데이터를 업로드하면<br />
                  이 화면에서 바로 확인하실 수 있어요.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
