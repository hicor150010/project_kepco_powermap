"use client";

/**
 * MapClient — 지도 base.
 *
 * 책임:
 *   - 마커 데이터 로딩 (/api/map-summary)
 *   - 지도/검색/필터/측정/GPS/로드뷰/지적도/새로고침/공유 등 base 기능
 *
 * 인터랙션 흐름 (마을 마커 클릭 / 지번 클릭 / 좌표 클릭 → 패널) 은
 * atomic endpoints (/api/capa/by-bjd, /api/capa/by-jibun, /api/parcel/by-pnu,
 * /api/parcel/by-latlng, /api/polygon/by-bjd) 로 새로 채울 자리.
 * 본 파일에서는 callback stub 만 둔다.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useIsMobile } from "@/lib/useIsMobile";
import KakaoMap from "./KakaoMap";
import Sidebar from "./Sidebar";
import MapToolbar from "./MapToolbar";
import DistanceTool from "./DistanceTool";
import type { SearchPick } from "./SearchResultList";
import Toast from "./Toast";
import TopRemainingList from "./TopRemainingList";
import GpsTracker from "./GpsTracker";
import RoadviewPanel from "./RoadviewPanel";
import LocationSummaryCard from "./LocationSummaryCard";
import LocationDetailModal from "./LocationDetailModal";
import PatentWatermark from "./PatentWatermark";
import {
  emptyFilters,
  type ColumnFilters,
  type MapSummaryRow,
  type MarkerColor,
  type KepcoDataRow,
} from "@/lib/types";

interface Props {
  isAdmin: boolean;
  email: string;
}

export default function MapClient({ isAdmin, email }: Props) {
  // ───────────────────────────── 데이터 ─────────────────────────────
  const [allRows, setAllRows] = useState<MapSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/map-summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAllRows(d.rows ?? []))
      .catch(() => setError("지도 데이터를 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, []);

  // ─────────────────── 새로고침 (MV refresh → map-summary) ───────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [refreshPhase, setRefreshPhase] = useState("");
  const [simpleToast, setSimpleToast] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setRefreshPhase("데이터 집계 중...");
      const mv = await fetch("/api/refresh-mv", { method: "POST" });
      if (!mv.ok) throw new Error("MV 갱신 실패");
      const mvJson = (await mv.json()) as { skipped?: boolean };

      setRefreshPhase("지도 데이터 불러오는 중...");
      const r = await fetch(`/api/map-summary?_t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error("새로고침 실패");
      const data = await r.json();
      setAllRows(data.rows ?? []);
      setSimpleToast(
        mvJson.skipped
          ? "최근에 갱신된 데이터를 불러왔습니다."
          : "최신 데이터로 갱신되었습니다."
      );
    } catch {
      setSimpleToast("새로고침에 실패했습니다.");
    } finally {
      setRefreshing(false);
      setRefreshPhase("");
    }
  }, []);

  // ───────────────────────────── 필터 ─────────────────────────────
  const [filters, setFilters] = useState<ColumnFilters>(emptyFilters());
  const [colorFilter] = useState<Set<MarkerColor>>(
    new Set(["red", "yellow", "green", "blue"])
  );
  const [mapFilteredAddrs, setMapFilteredAddrs] = useState<Set<string> | null>(
    null
  );
  const [mapFilterSource, setMapFilterSource] = useState<
    "search" | "filter" | "compare" | null
  >(null);
  const [panelResetKey, setPanelResetKey] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    snapshot: ColumnFilters;
  } | null>(null);

  const clearMapFilter = useCallback(() => {
    setMapFilteredAddrs(null);
    setMapFilterSource(null);
    setPanelResetKey((k) => k + 1);
  }, []);
  const applyMapFilter = useCallback(
    (addrs: Set<string>, source: "search" | "filter" | "compare") => {
      setMapFilteredAddrs(addrs);
      setMapFilterSource(source);
    },
    []
  );

  // ───────────────────────────── 지도 ─────────────────────────────
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [mapType, setMapType] = useState<"roadmap" | "skyview" | "hybrid">(
    "roadmap"
  );
  const [zoomLevel, setZoomLevel] = useState<number | undefined>(undefined);
  const [fitBoundsKey] = useState(0);
  const [centerMessage, setCenterMessage] = useState<string | null>(null);

  // ─────────────────────────── UI / 모바일 ───────────────────────────
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [topListOpen, setTopListOpen] = useState(false);

  const mobileInitRef = useRef(false);
  useEffect(() => {
    if (isMobile && !mobileInitRef.current) {
      setSidebarOpen(false);
      mobileInitRef.current = true;
    }
  }, [isMobile]);

  // ─────────────────── 도구: 측정 / GPS / 지적도 / 로드뷰 ───────────────────
  const [measureActive, setMeasureActive] = useState(false);
  const measureAddPointRef = useRef<((latlng: any) => void) | null>(null);
  const registerMeasureAddPoint = useCallback(
    (fn: ((latlng: any) => void) | null) => {
      measureAddPointRef.current = fn;
    },
    []
  );

  const [gpsActive, setGpsActive] = useState(false);
  const [gpsAutoFollow, setGpsAutoFollow] = useState(true);

  const [cadastralActive, setCadastralActive] = useState(false);
  const handleToggleCadastral = useCallback(() => {
    setCadastralActive((v) => !v);
    const level = mapInstance?.getLevel?.();
    if (!cadastralActive && level != null && level > 5) {
      setSimpleToast("지적편집도는 지도를 더 확대해야 잘 보입니다");
    }
  }, [mapInstance, cadastralActive]);

  const [roadviewActive, setRoadviewActive] = useState(false);
  const [roadviewPosition, setRoadviewPosition] = useState<{
    lat: number;
    lng: number;
    pan?: number;
  } | null>(null);
  const handleToggleRoadview = useCallback(() => {
    setRoadviewActive((v) => {
      const next = !v;
      if (!next) setRoadviewPosition(null);
      return next;
    });
  }, []);
  const handleRoadviewClick = useCallback((lat: number, lng: number) => {
    setRoadviewPosition({ lat, lng });
  }, []);
  const handleRoadviewClose = useCallback(() => {
    setRoadviewActive(false);
    setRoadviewPosition(null);
  }, []);

  const desktopRoadviewSplit = !!roadviewPosition && !isMobile;
  useEffect(() => {
    if (!mapInstance) return;
    const t = setTimeout(() => mapInstance.relayout(), 350);
    return () => clearTimeout(t);
  }, [sidebarOpen, mapInstance, desktopRoadviewSplit]);

  // ─────────────── 마을 클릭 → /api/capa/by-bjd ───────────────
  // raw rows 는 bjd_code+시설/용량만 포함 → 화면 컴포넌트가 기대하는 주소 필드를
  // MapSummaryRow 에서 enrich 해서 채움 (DB 에서 다시 join 하지 않고 클라이언트 합성).
  interface SelectedVillage {
    bjdCode: string;
    addr: string;
    rows: KepcoDataRow[];
    loading: boolean;
    error: string | null;
  }
  const [selectedVillage, setSelectedVillage] = useState<SelectedVillage | null>(
    null,
  );
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const villageReqSeqRef = useRef(0);

  const enrichRowsWithVillage = useCallback(
    (rows: KepcoDataRow[], v: MapSummaryRow): KepcoDataRow[] =>
      rows.map((r) => ({
        ...r,
        addr_do: v.addr_do,
        addr_si: v.addr_si,
        addr_gu: v.addr_gu,
        addr_dong: v.addr_dong,
        addr_li: v.addr_li,
        geocode_address: v.geocode_address,
        lat: v.lat,
        lng: v.lng,
      })),
    [],
  );

  const handleMarkerClick = useCallback(
    async (row: MapSummaryRow) => {
      const seq = ++villageReqSeqRef.current;
      setSelectedVillage({
        bjdCode: row.bjd_code,
        addr: row.geocode_address,
        rows: [],
        loading: true,
        error: null,
      });
      try {
        const res = await fetch(
          `/api/capa/by-bjd?bjd_code=${encodeURIComponent(row.bjd_code)}`,
        );
        if (seq !== villageReqSeqRef.current) return;
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "조회 실패");
        const enriched = enrichRowsWithVillage(data.rows ?? [], row);
        setSelectedVillage({
          bjdCode: row.bjd_code,
          addr: row.geocode_address,
          rows: enriched,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (seq !== villageReqSeqRef.current) return;
        setSelectedVillage({
          bjdCode: row.bjd_code,
          addr: row.geocode_address,
          rows: [],
          loading: false,
          error: String((err as Error).message ?? err),
        });
      }
    },
    [enrichRowsWithVillage],
  );

  const closeVillage = useCallback(() => {
    villageReqSeqRef.current++;
    setSelectedVillage(null);
    setDetailModalOpen(false);
  }, []);
  const handleParcelClick = useCallback((_lat: number, _lng: number) => {
    // TODO
  }, []);
  const handleSearchPick = useCallback((_pick: SearchPick) => {
    // TODO
  }, []);
  const handleSidebarPick = useCallback((_row: MapSummaryRow) => {
    // TODO
  }, []);
  const handleJibunPin = useCallback((_row: unknown) => {
    // TODO
  }, []);

  // ─────────────────────── 공유 / 줌 ───────────────────────
  const handleShare = useCallback(() => {
    if (!mapInstance) return;
    const center = mapInstance.getCenter();
    const params = new URLSearchParams();
    params.set("lat", center.getLat().toFixed(6));
    params.set("lng", center.getLng().toFixed(6));
    params.set("zoom", String(mapInstance.getLevel()));
    const filterKeys: (keyof ColumnFilters)[] = [
      "addr_do",
      "addr_gu",
      "addr_dong",
      "addr_li",
      "subst_nm",
      "dl_nm",
      "cap_subst",
      "cap_mtr",
      "cap_dl",
    ];
    for (const k of filterKeys) {
      const s = filters[k];
      if (s.size > 0) params.set(k, [...s].join(","));
    }
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard
      .writeText(url)
      .then(() => setSimpleToast("링크가 복사되었습니다"))
      .catch(() => setSimpleToast("링크 복사에 실패했어요"));
  }, [mapInstance, filters]);

  // ─────────────────────────── render ───────────────────────────
  return (
    <div className="flex h-dvh overflow-hidden relative">
      <Sidebar
        isAdmin={isAdmin}
        email={email}
        totalRows={allRows}
        filters={filters}
        onFiltersChange={setFilters}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSearchPick={handleSearchPick}
        onJibunPin={handleJibunPin}
        onSearchFocus={() => {
          /* TODO: 검색 포커스 시 선택 마을 해제 */
        }}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        selectedAddr={null}
        onMapFilter={applyMapFilter}
        onClearMapFilter={clearMapFilter}
        panelResetKey={panelResetKey}
      />

      <main className="flex-1 flex min-w-0">
        <div
          className={`relative min-w-0 ${
            desktopRoadviewSplit ? "w-1/2" : "w-full"
          }`}
        >
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70">
              <div className="bg-white rounded-lg shadow-lg px-6 py-4 border border-gray-200">
                <div className="text-sm text-gray-700">지도를 불러오는 중...</div>
              </div>
            </div>
          )}

          {refreshing && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
              <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 border border-gray-100 flex flex-col items-center gap-3 min-w-[220px]">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-[3px] border-gray-200" />
                  <div className="absolute inset-0 rounded-full border-[3px] border-t-blue-500 animate-spin" />
                </div>
                <div className="text-sm font-semibold text-gray-800">
                  데이터 갱신 중
                </div>
                <div className="text-xs text-gray-500">
                  {refreshPhase || "잠시만 기다려주세요..."}
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden mt-1">
                  <div
                    className="h-full bg-blue-500 rounded-full animate-pulse"
                    style={{ width: "60%" }}
                  />
                </div>
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
            rows={allRows}
            colorFilter={colorFilter}
            onMarkerClick={handleMarkerClick}
            fitBoundsKey={fitBoundsKey}
            onMapReady={setMapInstance}
            measureMode={measureActive}
            measureAddPointRef={measureAddPointRef}
            selectedAddr={selectedVillage?.addr ?? null}
            mapType={mapType}
            onRenderingChange={(rendering) =>
              setCenterMessage(rendering ? "지도 마커 준비 중..." : null)
            }
            visibleAddrs={mapFilteredAddrs}
            roadviewActive={roadviewActive}
            roadviewPosition={roadviewPosition}
            onRoadviewClick={handleRoadviewClick}
            cadastralActive={cadastralActive}
            onParcelClick={handleParcelClick}
            highlightedParcel={null}
          />

          {/* 지도 상태 바 */}
          {allRows.length > 0 &&
            (() => {
              const isFiltered = mapFilteredAddrs != null;
              const visibleCount = isFiltered
                ? mapFilteredAddrs.size
                : allRows.length;
              const visibleJibun = isFiltered
                ? allRows
                    .filter((r) => mapFilteredAddrs.has(r.geocode_address))
                    .reduce((s, r) => s + r.total, 0)
                : allRows.reduce((s, r) => s + r.total, 0);
              const sourceLabel =
                mapFilterSource === "search"
                  ? "주소검색"
                  : mapFilterSource === "filter"
                    ? "조건검색"
                    : mapFilterSource === "compare"
                      ? "변화추적"
                      : "전체 보기";
              const dotColor =
                mapFilterSource === "compare"
                  ? "bg-orange-500"
                  : mapFilterSource === "search"
                    ? "bg-green-500"
                    : mapFilterSource === "filter"
                      ? "bg-blue-500"
                      : "bg-gray-400";
              return (
                <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-4 md:bottom-auto md:top-2">
                  <div className="flex items-center gap-1.5 md:gap-2 bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-full px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs whitespace-nowrap">
                    {isFiltered ? (
                      <button
                        type="button"
                        onClick={clearMapFilter}
                        className={`flex items-center gap-1 px-1.5 py-0.5 md:px-2 md:py-1 rounded-full text-[10px] md:text-[11px] font-bold text-white shrink-0 hover:opacity-80 active:opacity-60 transition-opacity ${dotColor}`}
                      >
                        {sourceLabel}
                        <span className="text-white/70 text-[9px] ml-0.5">✕</span>
                      </button>
                    ) : (
                      <span
                        className={`px-1.5 py-0.5 md:px-2 md:py-1 rounded-full text-[10px] md:text-[11px] font-bold text-white shrink-0 ${dotColor}`}
                      >
                        {sourceLabel}
                      </span>
                    )}
                    <span className="text-gray-800 font-bold tabular-nums">
                      {visibleCount.toLocaleString()}
                    </span>
                    <span className="text-gray-400 text-[10px] md:text-[11px]">
                      마을
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-800 font-bold tabular-nums">
                      {visibleJibun.toLocaleString()}
                    </span>
                    <span className="text-gray-400 text-[10px] md:text-[11px]">
                      지번
                    </span>
                  </div>
                </div>
              );
            })()}

          {/* 우상단 도구 패널 */}
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
            roadviewActive={roadviewActive}
            onToggleRoadview={handleToggleRoadview}
            cadastralActive={cadastralActive}
            onToggleCadastral={handleToggleCadastral}
            onZoomIn={() => mapInstance?.setLevel(mapInstance.getLevel() - 1)}
            onZoomOut={() => mapInstance?.setLevel(mapInstance.getLevel() + 1)}
            onShare={handleShare}
          />

          {topListOpen && (
            <TopRemainingList
              rows={allRows}
              onPick={handleSidebarPick}
              onClose={() => setTopListOpen(false)}
              topN={10}
            />
          )}

          <DistanceTool
            map={mapInstance}
            active={measureActive}
            onClose={() => setMeasureActive(false)}
            registerAddPoint={registerMeasureAddPoint}
          />

          <GpsTracker
            map={mapInstance}
            active={gpsActive}
            autoFollow={gpsAutoFollow}
            onAutoFollowChange={setGpsAutoFollow}
            onError={(msg) => setError(msg)}
          />

          {toast && (
            <Toast
              message={toast.message}
              actionLabel="되돌리기"
              onAction={() => setFilters(toast.snapshot)}
              onClose={() => setToast(null)}
            />
          )}

          {simpleToast && (
            <Toast
              message={simpleToast}
              onClose={() => setSimpleToast(null)}
              duration={3000}
            />
          )}

          {centerMessage && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="bg-white/90 rounded-xl px-5 py-4 shadow-lg flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-600">{centerMessage}</span>
              </div>
            </div>
          )}

          {/* 마을 요약 카드 (마커 클릭) */}
          {selectedVillage && !detailModalOpen && (
            <LocationSummaryCard
              key={selectedVillage.bjdCode}
              rows={selectedVillage.rows}
              loading={selectedVillage.loading}
              onShowDetail={() => setDetailModalOpen(true)}
              onClose={closeVillage}
            />
          )}

          {/* 마을 상세 모달 ("상세 보기") */}
          {detailModalOpen && selectedVillage && (
            <LocationDetailModal
              rows={selectedVillage.rows}
              onClose={() => setDetailModalOpen(false)}
              onJibunPin={handleJibunPin}
              initialSearch=""
            />
          )}

          {/* 빈 데이터 안내 */}
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
                      관리자 메뉴에서 크롤을 실행하시면<br />
                      바로 지도에 표시됩니다.
                    </div>
                    <Link
                      href="/admin/crawl"
                      className="inline-block bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-md transition-colors"
                    >
                      📥 크롤 시작하기
                    </Link>
                  </>
                ) : (
                  <div className="text-xs text-gray-600 leading-relaxed">
                    관리자가 데이터를 수집하면<br />
                    이 화면에서 바로 확인하실 수 있어요.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 로드뷰 패널 — 데스크톱 분할 (우측 절반) */}
        {desktopRoadviewSplit && roadviewPosition && (
          <div className="w-1/2 relative border-l border-gray-300">
            <RoadviewPanel
              position={roadviewPosition}
              onClose={handleRoadviewClose}
              onPositionChange={(lat, lng, pan) =>
                setRoadviewPosition({ lat, lng, pan })
              }
            />
          </div>
        )}
      </main>

      {/* 로드뷰 패널 — 모바일 전체화면 모달 */}
      {isMobile && roadviewPosition && (
        <RoadviewPanel
          position={roadviewPosition}
          onClose={handleRoadviewClose}
          onPositionChange={(lat, lng) => setRoadviewPosition({ lat, lng })}
          isMobile
        />
      )}

      <PatentWatermark />
    </div>
  );
}
