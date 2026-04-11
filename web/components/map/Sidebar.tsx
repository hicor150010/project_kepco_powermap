"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import LogoutButton from "@/components/auth/LogoutButton";
import FilterPanel from "./FilterPanel";
import SearchResultList, { type SearchPick } from "./SearchResultList";
import type { MapSummaryRow, ColumnFilters, KepcoDataRow } from "@/lib/types";
import type { SearchRiResult } from "@/lib/search/searchKepco";
import MapLegend from "./MapLegend";

type SidebarTab = "search" | "filter";

interface Props {
  isAdmin: boolean;
  email: string;
  totalRows: MapSummaryRow[];
  filters: ColumnFilters;
  onFiltersChange: (f: ColumnFilters) => void;
  isOpen: boolean;
  onToggle: () => void;
  /** 검색 결과 클릭 */
  onSearchPick?: (pick: SearchPick) => void;
  /** 지번 핀 표시 */
  onJibunPin?: (row: KepcoDataRow) => void;
  /** 검색바 포커스 시 (카드 숨기기 등) */
  onSearchFocus?: () => void;
  /** 데이터 새로고침 */
  onRefresh?: () => void;
  refreshing?: boolean;
}

// ── 검색 히스토리 ──
const HISTORY_KEY = "kepco_search_history";
const HISTORY_MAX = 10;
function getHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function addHistory(q: string) {
  const list = getHistory().filter((h) => h !== q);
  list.unshift(q);
  if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}
function removeHistory(q: string) {
  const list = getHistory().filter((h) => h !== q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

interface SearchState {
  loading: boolean;
  error: string | null;
  ri: SearchRiResult[];
  ji: KepcoDataRow[];
  jiFallback: boolean;
  parsed: { keywords: string[]; lotNo: number | null } | null;
}
const EMPTY_SEARCH: SearchState = { loading: false, error: null, ri: [], ji: [], jiFallback: false, parsed: null };

export default function Sidebar({
  isAdmin,
  email,
  totalRows,
  filters,
  onFiltersChange,
  isOpen,
  onToggle,
  onSearchPick,
  onJibunPin,
  onSearchFocus,
  onRefresh,
  refreshing,
}: Props) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("search");

  // ── 검색 상태 ──
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH);
  const [searchTab, setSearchTab] = useState<"ri" | "ji">("ri");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q) return;
    addHistory(q);
    setHistory(getHistory());
    setHistoryOpen(false);
    setSearchState({ ...EMPTY_SEARCH, loading: true });
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("검색이 잘 안 돼요. 잠시 후 다시 시도해 주세요.");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "검색이 잘 안 돼요.");
      setSearchState({ loading: false, error: null, ri: data.ri ?? [], ji: data.ji ?? [], jiFallback: data.jiFallback ?? false, parsed: data.parsed ?? null });
      setSearchTab(data.parsed?.lotNo != null ? "ji" : "ri");
    } catch (err: any) {
      setSearchState({ ...EMPTY_SEARCH, error: String(err?.message || err) });
    }
  }, []);

  const handleClear = () => { setQuery(""); setSearchState(EMPTY_SEARCH); };

  // 통계
  const totalMarkers = totalRows.length;
  const totalDataRows = totalRows.reduce((sum, r) => sum + r.total, 0);

  // "여유 있는 곳만 보기" 빠른 토글
  const isPromisingMode =
    filters.cap_subst.size === 1 &&
    filters.cap_subst.has("전부 여유") &&
    filters.cap_mtr.size === 1 &&
    filters.cap_mtr.has("전부 여유") &&
    filters.cap_dl.size === 1 &&
    filters.cap_dl.has("전부 여유");

  const togglePromising = () => {
    if (isPromisingMode) {
      onFiltersChange({
        ...filters,
        cap_subst: new Set(),
        cap_mtr: new Set(),
        cap_dl: new Set(),
      });
    } else {
      // 활성: 3시설 모두 "전부 여유"로
      onFiltersChange({
        ...filters,
        cap_subst: new Set(["전부 여유"]),
        cap_mtr: new Set(["전부 여유"]),
        cap_dl: new Set(["전부 여유"]),
      });
    }
  };

  return (
    <>
      {/* 모바일 오버레이 백드롭 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* ── 사이드바 + 엣지 핸들 래퍼 ── */}
      <div
        className={`
          flex flex-shrink-0
          fixed inset-y-0 left-0 z-50
          md:relative md:z-auto md:inset-auto
          transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0 md:ml-0" : "-translate-x-full md:-ml-80"}
          md:translate-x-0
        `}
      >
      <aside
        className="w-80 max-w-[85vw] bg-white border-r border-gray-200
          flex flex-col h-full shadow-lg md:shadow-none"
      >
        {/* ── 헤더: 타이틀 ── */}
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="flex items-center">
            <h1 className="text-sm font-bold text-gray-900">배전선로 여유용량 지도</h1>
          </div>
          {/* 통계 + 새로고침 */}
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-gray-900">{totalDataRows.toLocaleString()}</span>
              <span className="text-[10px] text-gray-400">건</span>
            </div>
            <span className="text-gray-300">·</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-blue-600">{totalMarkers.toLocaleString()}</span>
              <span className="text-[10px] text-gray-400">마을</span>
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50 text-[11px] font-medium transition-colors"
                title="최신 데이터 새로고침"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={refreshing ? "animate-spin" : ""}
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                {refreshing ? "갱신 중" : "새로고침"}
              </button>
            )}
          </div>
          {/* 마커 범례 — 기본 접혀있음 */}
          <div className="mt-1.5">
            <MapLegend />
          </div>
          {/* 사용자 + 관리 */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-gray-400 truncate">{email}</span>
            {isAdmin && (
              <>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1 py-0.5 rounded flex-shrink-0">관리자</span>
                <div className="flex gap-1.5 ml-auto flex-shrink-0">
                  <Link href="/admin/upload" className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold border border-blue-200">업로드</Link>
                  <Link href="/admin/crawl" className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold border border-emerald-200">수집</Link>
                  <Link href="/admin/users" className="text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-500 hover:bg-gray-100 font-semibold border border-gray-200">계정</Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── 탭: 검색 / 필터 ── */}
        <div className="flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab("search")}
            className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
              activeTab === "search"
                ? "text-blue-600 border-b-2 border-blue-500 bg-blue-50/30"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            🔍 검색
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("filter")}
            className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
              activeTab === "filter"
                ? "text-blue-600 border-b-2 border-blue-500 bg-blue-50/30"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            📋 조건검색
          </button>
        </div>

        {/* ── 탭 콘텐츠 ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "search" && (
            <div className="flex flex-col h-full">
              {/* 검색 입력 */}
              <div className="px-3 py-2.5 border-b border-gray-100 relative">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-gray-50 border border-gray-200 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-400 flex-shrink-0">🔍</span>
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") doSearch(query.trim()); }}
                      onFocus={() => {
                        const h = getHistory();
                        setHistory(h);
                        if (h.length > 0 && searchState.ri.length === 0 && searchState.ji.length === 0) setHistoryOpen(true);
                        onSearchFocus?.();
                      }}
                      onBlur={() => setTimeout(() => setHistoryOpen(false), 150)}
                      placeholder="주소·지번 검색"
                      className="flex-1 min-w-0 text-sm text-gray-900 placeholder:text-gray-400 bg-transparent outline-none"
                    />
                    {query && (
                      <button type="button" onClick={handleClear} className="p-1 text-gray-400 hover:text-gray-600 active:text-gray-800 flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => doSearch(query.trim())}
                    disabled={!query.trim() || searchState.loading}
                    className="text-xs px-3 py-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium flex-shrink-0"
                  >
                    검색
                  </button>
                </div>

                {/* 히스토리 드롭다운 */}
                {historyOpen && history.length > 0 && (
                  <div className="absolute left-3 right-3 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-20">
                    <div className="px-3 py-1 text-[10px] text-gray-400 font-semibold border-b border-gray-100">최근 검색</div>
                    {history.map((h) => (
                      <div key={h} className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 cursor-pointer group">
                        <span className="text-gray-300 text-[10px]">🕐</span>
                        <button
                          type="button"
                          className="flex-1 text-left text-xs text-gray-700 truncate"
                          onMouseDown={(e) => { e.preventDefault(); setQuery(h); doSearch(h); }}
                        >{h}</button>
                        <button
                          type="button"
                          className="text-gray-300 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100"
                          onMouseDown={(e) => { e.preventDefault(); removeHistory(h); setHistory(getHistory()); }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 검색 결과 */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {searchState.loading && (
                  <div className="px-4 py-8 text-center text-xs text-gray-500">검색 중...</div>
                )}
                {searchState.error && (
                  <div className="px-4 py-8 text-center">
                    <div className="text-2xl mb-1">⚠️</div>
                    <div className="text-xs text-red-700">{searchState.error}</div>
                  </div>
                )}
                {!searchState.loading && !searchState.error && (searchState.ri.length > 0 || searchState.ji.length > 0) && (
                  <>
                    {/* 리/지번 탭 */}
                    <div className="flex border-b border-gray-100 px-2">
                      {(["ri", "ji"] as const).map((t) => {
                        const count = t === "ri" ? searchState.ri.length : searchState.ji.length;
                        const label = t === "ri" ? "리 단위" : "지번 단위";
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setSearchTab(t)}
                            className={`px-3 py-1.5 text-[11px] font-semibold border-b-2 transition-colors flex items-center gap-1 ${
                              searchTab === t
                                ? "border-blue-500 text-blue-600"
                                : "border-transparent text-gray-400 hover:text-gray-600"
                            }`}
                          >
                            {label}
                            <span className={`text-[10px] px-1 rounded-full ${
                              count > 0
                                ? searchTab === t ? "bg-blue-500 text-white" : "bg-blue-100 text-blue-700"
                                : "bg-gray-200 text-gray-500"
                            }`}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* 폴백 안내 */}
                    {searchTab === "ji" && searchState.jiFallback && searchState.parsed?.lotNo != null && searchState.ji.length > 0 && (
                      <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[11px] text-amber-800">
                        💡 <b>{searchState.parsed.lotNo}번지</b>가 없어 가장 가까운 지번을 보여드려요.
                      </div>
                    )}
                    <SearchResultList
                      mode={searchTab}
                      ri={searchState.ri}
                      ji={searchState.ji}
                      onPick={(pick) => {
                        onSearchPick?.(pick);
                        // 모바일에서는 사이드바 닫아서 지도 보여주기
                        if (window.innerWidth < 768) onToggle();
                      }}
                      onJibunPin={onJibunPin ? (row) => {
                        onJibunPin(row);
                        if (window.innerWidth < 768) onToggle();
                      } : undefined}
                    />
                  </>
                )}
                {!searchState.loading && !searchState.error && searchState.ri.length === 0 && searchState.ji.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <div className="text-2xl mb-2">🔍</div>
                    <div className="text-xs text-gray-500">
                      주소나 지번을 입력해 검색하세요
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      예: <span className="text-gray-600 font-medium">담양읍</span>,{" "}
                      <span className="text-gray-600 font-medium">용구리 100</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "filter" && (
            <FilterPanel
              totalRows={totalRows}
              filters={filters}
              onChange={onFiltersChange}
              isPromisingMode={isPromisingMode}
              onTogglePromising={togglePromising}
              onSearchPick={(pick) => {
                onSearchPick?.(pick);
                if (window.innerWidth < 768) onToggle();
              }}
            />
          )}
        </div>

        {/* 푸터 */}
        <div className="px-3 py-2 border-t border-gray-200">
          <LogoutButton />
        </div>
    </aside>

      {/* ── 엣지 탭 핸들: 사이드바 오른쪽에 붙은 열기/닫기 토글 ── */}
      <button
        onClick={onToggle}
        className="self-center flex-shrink-0
          w-6 h-14 flex items-center justify-center
          bg-white border border-l-0 border-gray-200
          rounded-r-lg shadow-md
          text-gray-500 hover:text-gray-800 hover:bg-gray-50
          transition-colors"
        aria-label={isOpen ? "사이드바 닫기" : "사이드바 열기"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-300 ${isOpen ? "" : "rotate-180"}`}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      </div>
    </>
  );
}
