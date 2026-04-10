"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
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

  // 2. 필터 적용 (메모리)
  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      // 1차: 여유용량 (공용 유틸 사용 — FilterPanel과 동일 로직)
      if (!matchesVolumeFilter(r.subst_no_cap, r.total, filters.vol_subst)) return false;
      if (!matchesVolumeFilter(r.mtr_no_cap, r.total, filters.vol_mtr)) return false;
      if (!matchesVolumeFilter(r.dl_no_cap, r.total, filters.vol_dl)) return false;

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
      setSelectedAddr(addr);
      setDetailModalOpen(false);

      // 캐시 확인 — 이미 받아둔 마을이면 재호출 X (호출 최소화 원칙)
      const cached = detailCache.get(addr);
      if (cached) {
        setSelectedRows(cached);
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
      } catch (err) {
        console.error("[location] 조회 실패", err);
      } finally {
        setDetailLoading(false);
      }
    },
    [detailCache]
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
        mapInstance.setLevel(5, { animate: true });
        mapInstance.setCenter(pos);
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

      const lat = pick.row.lat;
      const lng = pick.row.lng;
      if (lat == null || lng == null) return;

      // 지도 이동
      const pos = new window.kakao.maps.LatLng(lat, lng);
      mapInstance.setLevel(5, { animate: true });
      mapInstance.setCenter(pos);

      // 해당 마을의 geocode_address 파악 — 지번 결과면 바로, 리 결과면 allRows에서 매칭
      let targetAddr: string | null = null;
      if (pick.kind === "ji") {
        targetAddr = pick.row.geocode_address;
      } else {
        const match = allRows.find(
          (r) =>
            r.addr_do === pick.row.addr_do &&
            r.addr_si === pick.row.addr_si &&
            r.addr_gu === pick.row.addr_gu &&
            r.addr_dong === pick.row.addr_dong &&
            r.addr_li === pick.row.addr_li
        );
        targetAddr = match?.geocode_address ?? null;
      }

      // 마커 클릭과 동일한 "선택" 시각 피드백
      if (targetAddr) {
        setSelectedAddr(targetAddr);
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
          .filter((p) => p && p !== "-기타지역")
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
    [mapInstance, filteredRows, filters, allRows]
  );

  return (
    <div className="flex h-screen overflow-hidden relative">
      <Sidebar
        isAdmin={isAdmin}
        email={email}
        totalRows={allRows}
        filteredRows={filteredRows}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <main className="flex-1 relative">
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
        />

        {/* 좌상단 마커 색상 범례 */}
        <MapLegend />

        {/* 우상단 도구 패널 (거리재기 / 유망 부지 TOP) */}
        <MapToolbar
          measureActive={measureActive}
          onToggleMeasure={() => setMeasureActive((v) => !v)}
          topListActive={topListOpen}
          onToggleTopList={() => setTopListOpen((v) => !v)}
          mapType={mapType}
          onMapTypeChange={setMapType}
          onZoomIn={() => mapInstance?.setLevel(mapInstance.getLevel() - 1)}
          onZoomOut={() => mapInstance?.setLevel(mapInstance.getLevel() + 1)}
        />

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

        {/* 화면 하단 검색 패널 (주소·지번 → 업로드된 데이터 검색) */}
        <SearchPanel onPick={handleSearchPick} />

        {/* 필터 자동 해제 시 토스트 (되돌리기 가능) */}
        {toast && (
          <Toast
            message={toast.message}
            actionLabel="되돌리기"
            onAction={() => setFilters(toast.snapshot)}
            onClose={() => setToast(null)}
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
            }}
          />
        )}

        {/* 상세 모달 */}
        {detailModalOpen && selectedRows && (
          <LocationDetailModal
            rows={selectedRows}
            onClose={() => setDetailModalOpen(false)}
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
