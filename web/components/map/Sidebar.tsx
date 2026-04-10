"use client";

import Link from "next/link";
import LogoutButton from "@/components/auth/LogoutButton";
import FilterPanel from "./FilterPanel";
import type { MapSummaryRow, ColumnFilters } from "@/lib/types";

interface Props {
  isAdmin: boolean;
  email: string;
  totalRows: MapSummaryRow[];      // 전체 (필터 옵션 추출용)
  filteredRows: MapSummaryRow[];   // 필터 적용된
  filters: ColumnFilters;
  onFiltersChange: (f: ColumnFilters) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  isAdmin,
  email,
  totalRows,
  filteredRows,
  filters,
  onFiltersChange,
  isOpen,
  onToggle,
}: Props) {
  // 통계
  const totalMarkers = filteredRows.length;
  const totalDataRows = filteredRows.reduce((sum, r) => sum + r.total, 0);
  const allDataRows = totalRows.reduce((sum, r) => sum + r.total, 0);

  // "여유 있는 곳만 보기" 빠른 토글
  // 활성 조건: 변전소·주변압기·배전선로 3개가 모두 "전부 여유"로 설정됨
  // (그 외 다른 필터(지역·설비)는 건드리지 않음)
  const isPromisingMode =
    filters.vol_subst.size === 1 &&
    filters.vol_subst.has("전부 여유") &&
    filters.vol_mtr.size === 1 &&
    filters.vol_mtr.has("전부 여유") &&
    filters.vol_dl.size === 1 &&
    filters.vol_dl.has("전부 여유");

  const togglePromising = () => {
    if (isPromisingMode) {
      // 해제: 3시설 vol 필터만 비움
      onFiltersChange({
        ...filters,
        vol_subst: new Set(),
        vol_mtr: new Set(),
        vol_dl: new Set(),
      });
    } else {
      // 활성: 3시설 모두 "전부 여유"로
      onFiltersChange({
        ...filters,
        vol_subst: new Set(["전부 여유"]),
        vol_mtr: new Set(["전부 여유"]),
        vol_dl: new Set(["전부 여유"]),
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

      <aside
        className={`
          w-80 max-w-[85vw] bg-white border-r border-gray-200
          flex flex-col h-full shadow-lg md:shadow-none flex-shrink-0
          transition-all duration-300 ease-in-out

          fixed inset-y-0 left-0 z-50
          ${isOpen ? "translate-x-0" : "-translate-x-full"}

          md:static md:z-auto md:translate-x-0
          ${isOpen ? "md:ml-0" : "md:-ml-80"}
        `}
      >
        {/* 헤더 + 닫기 버튼 */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900">
              배전선로 여유용량 지도
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">KEPCO 데이터 시각화</p>
          </div>
          <button
            onClick={onToggle}
            className="ml-2 mt-0.5 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="사이드바 닫기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        </div>

      {/* 사용자 정보 + 관리 메뉴 */}
      <div className="px-5 py-3 border-b border-gray-200">
        <div className="text-xs">
          <span className="text-gray-500">{email}</span>
          {isAdmin && (
            <span className="ml-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              관리자
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2 mt-3">
            <Link
              href="/admin/upload"
              className="flex-1 text-xs text-center py-2 rounded-md font-bold
                         bg-blue-100/60 text-blue-700 hover:bg-blue-100
                         border border-blue-300 transition-colors"
            >
              &#8593; 업로드
            </Link>
            <Link
              href="/admin/crawl"
              className="flex-1 text-xs text-center py-2 rounded-md font-bold
                         bg-emerald-100/60 text-emerald-700 hover:bg-emerald-100
                         border border-emerald-300 transition-colors"
            >
              &#8635; 수집
            </Link>
            <Link
              href="/admin/users"
              className="flex-1 text-xs text-center py-2 rounded-md font-bold
                         bg-gray-100/60 text-gray-700 hover:bg-gray-100
                         border border-gray-300 transition-colors"
            >
              &#9881; 계정관리
            </Link>
          </div>
        )}
      </div>

      {/* 통계 */}
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="text-3xl font-bold text-gray-900 leading-none">
          {totalDataRows.toLocaleString()}
          <span className="text-sm font-medium text-gray-400 ml-1">건</span>
        </div>
        <div className="text-xs text-gray-600 mt-2 leading-relaxed">
          지도 위{" "}
          <span className="font-semibold text-blue-600">
            {totalMarkers.toLocaleString()}개 마을(리·동)
          </span>
          에 표시됨
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs">
          <div className="flex justify-between text-gray-600">
            <span>전체 데이터</span>
            <span className="font-medium text-gray-900">
              {allDataRows.toLocaleString()}건
            </span>
          </div>
        </div>
        <div className="mt-2.5 text-[10px] text-gray-400 leading-relaxed">
          💡 같은 마을(리·동)의 데이터는 한 마커로 모아 보여드려요. 클릭하면
          그 안의 모든 데이터를 볼 수 있어요.
        </div>
      </div>

      {/* 필터 패널 (스크롤) */}
      <div className="flex-1 overflow-y-auto">
        <FilterPanel
          totalRows={totalRows}
          filters={filters}
          onChange={onFiltersChange}
          isPromisingMode={isPromisingMode}
          onTogglePromising={togglePromising}
        />
      </div>

      {/* 푸터 */}
      <div className="px-5 py-3 border-t border-gray-200">
        <LogoutButton />
      </div>
    </aside>
    </>
  );
}
