"use client";

import { useState } from "react";
import type { LocationData, MarkerColor, ViewMode, ColumnFilters as Filters } from "@/lib/types";
import { VIEW_MODE_LABELS, VIEW_MODE_DESC } from "@/lib/types";
import { getColorByMode } from "@/lib/colorByMode";
import ColumnFilters from "./ColumnFilters";

interface SidebarProps {
  fileNames: string[];
  data: LocationData[];           // 전체 (필터 옵션 추출용)
  filteredData: LocationData[];   // 컬럼 필터 적용된 데이터 (통계용)
  filter: Set<MarkerColor>;
  onFilterChange: (filter: Set<MarkerColor>) => void;
  onUploadClick: () => void;
  onDownloadClick: () => void;
  onSearch: (query: string) => void;
  onClearAll: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  columnFilters: Filters;
  onColumnFiltersChange: (filters: Filters) => void;
}

export default function Sidebar({
  fileNames,
  data,
  filteredData,
  filter,
  onFilterChange,
  onUploadClick,
  onDownloadClick,
  onSearch,
  onClearAll,
  viewMode,
  onViewModeChange,
  columnFilters,
  onColumnFiltersChange,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // 좌표 있는 데이터 + 고유 위치(마커) 수
  let withCoords = 0;
  const uniqueLocations = new Set<string>();
  filteredData.forEach((d) => {
    if (d.lat && d.lng) {
      withCoords++;
      uniqueLocations.add(`${d.lat},${d.lng}`);
    }
  });
  const markerCount = uniqueLocations.size;

  return (
    <aside className="w-80 max-w-[85vw] bg-white border-r border-gray-200 flex flex-col h-full shadow-lg md:shadow-none">
      {/* 헤더 */}
      <div className="px-5 py-4 border-b border-gray-200">
        <h1 className="text-base font-bold text-gray-900">
          배전선로 여유용량 지도
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">KEPCO 데이터 시각화</p>
      </div>

      {/* 파일 정보 */}
      <div className="px-5 py-4 border-b border-gray-200">
        {fileNames.length > 0 ? (
          <>
            <div className="text-xs text-gray-500 mb-1.5">
              업로드된 파일 ({fileNames.length}개)
            </div>
            <div className="space-y-1 mb-3 max-h-24 overflow-y-auto">
              {fileNames.map((name, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-xs text-gray-700"
                >
                  <svg
                    className="w-3 h-3 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="truncate flex-1">{name}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onUploadClick}
                className="flex-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 py-1.5 rounded-md font-medium"
              >
                + 파일 추가
              </button>
              <button
                onClick={onClearAll}
                className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-1.5 rounded-md"
              >
                전체 지우기
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={onUploadClick}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            엑셀 파일 업로드
          </button>
        )}
      </div>

      {/* 검색 */}
      {data.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) onSearch(searchQuery.trim());
            }}
          >
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              주소로 이동
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="예: 전라남도 고흥군"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-sm rounded-md text-gray-700"
              >
                이동
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 스크롤 영역 시작 */}
      <div className="flex-1 overflow-y-auto">
      {/* 보기 모드 선택 */}
      {data.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-200">
          <label className="text-xs font-medium text-gray-700 mb-1.5 block">
            보기 기준
          </label>
          <select
            value={viewMode}
            onChange={(e) => onViewModeChange(e.target.value as ViewMode)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {VIEW_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
            {VIEW_MODE_DESC[viewMode]}
          </p>
        </div>
      )}

      {/* 컬럼 필터 */}
      {data.length > 0 && (
        <ColumnFilters
          data={data}
          filters={columnFilters}
          onChange={onColumnFiltersChange}
        />
      )}

      {/* 통계 요약 */}
      {data.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="text-3xl font-bold text-gray-900 leading-none">
            {withCoords.toLocaleString()}
            <span className="text-sm font-medium text-gray-400 ml-1">건</span>
          </div>
          <div className="text-xs text-gray-600 mt-2 leading-relaxed">
            지도 위 <span className="font-semibold text-blue-600">{markerCount.toLocaleString()}개 마을(리·동)</span>에
            나뉘어 표시되어 있어요
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>지금 보고 있는 데이터</span>
              <span className="font-medium text-gray-900">
                {filteredData.length.toLocaleString()}건
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>업로드한 전체 데이터</span>
              <span className="font-medium text-gray-900">
                {data.length.toLocaleString()}건
              </span>
            </div>
          </div>
          <div className="mt-2.5 text-[10px] text-gray-400 leading-relaxed">
            💡 같은 마을(리·동)의 데이터는 한 마커로 모아 보여드려요. 클릭하면 그 안의 모든 데이터를 볼 수 있어요.
          </div>
        </div>
      )}
      </div>
      {/* 스크롤 영역 끝 */}

      {/* 다운로드 */}
      {data.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-200">
          <button
            onClick={onDownloadClick}
            className="w-full text-sm text-gray-600 hover:text-gray-900 py-1.5 flex items-center justify-center gap-1.5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            현재 보기 엑셀로 저장
          </button>
        </div>
      )}
    </aside>
  );
}
