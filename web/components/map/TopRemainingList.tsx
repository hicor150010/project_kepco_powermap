"use client";

/**
 * 유망 부지 TOP N — 잔여 용량 큰 순 리스트 (지도 위 플로팅 패널).
 *
 * 썬캐쉬하우스 사용자(태양광 사업자)가 가장 빨리 발견하고 싶은 정보:
 * "어디가 가장 큰 발전 용량이 가능한가?"
 *
 * 화면 우상단(MapToolbar 옆)에 플로팅 패널로 떠 있고, 사이드바 공간을 차지하지 않는다.
 * 부모(MapClient)가 active 상태를 관리하고, 활성일 때만 마운트한다.
 *
 * 단일 책임: 정렬 + 표시 + 클릭 위임. 상세 데이터 fetch는 부모 담당.
 */

import { useMemo } from "react";
import type { MapSummaryRow } from "@/lib/types";
import AddrLine from "./AddrLine";

interface Props {
  /** 필터 적용된 마을 목록 (이미 필터링된 결과) */
  rows: MapSummaryRow[];
  /** 항목 클릭 시 호출 — 부모가 지도 이동 + 카드 처리 */
  onPick: (row: MapSummaryRow) => void;
  /** 패널 닫기 (X 버튼) */
  onClose: () => void;
  /** TOP 몇 개 보여줄지 (기본 10) */
  topN?: number;
}

/** kW → 사람이 읽기 좋은 단위 (예: 1234 → 1.23 MW, 800 → 800 kW) */
function formatKw(kw: number): string {
  if (!kw || kw <= 0) return "0 kW";
  if (kw >= 1000) return `${(kw / 1000).toFixed(2)} MW`;
  return `${kw.toLocaleString()} kW`;
}

export default function TopRemainingList({
  rows,
  onPick,
  onClose,
  topN = 10,
}: Props) {
  // 잔여 용량 큰 순 정렬 + 0보다 큰 것만 + topN 개
  const top = useMemo(() => {
    return [...rows]
      .filter((r) => (r.max_remaining_kw ?? 0) > 0)
      .sort((a, b) => (b.max_remaining_kw ?? 0) - (a.max_remaining_kw ?? 0))
      .slice(0, topN);
  }, [rows, topN]);

  return (
    // 우상단 — 도구 패널(top-4 right-4) 아래에 위치
    <div className="absolute top-16 right-4 z-10 w-[300px] max-w-[calc(100vw-32px)]">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
        {/* 헤더 — 닫기 버튼 포함 */}
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2 bg-amber-50">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🌞</span>
            <span className="text-xs font-bold text-amber-900">
              유망 부지 TOP {topN}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-base leading-none px-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {top.length === 0 ? (
            <div className="text-[11px] text-gray-400 text-center py-6">
              현재 필터에서 잔여 용량이 있는 마을이 없어요
            </div>
          ) : (
            <ol className="space-y-1">
              {top.map((row, i) => {
                const placeParts =
                  [row.addr_gu, row.addr_dong, row.addr_li]
                    .filter(Boolean) as string[];
                return (
                  <li key={row.geocode_address}>
                    <button
                      type="button"
                      onClick={() => onPick(row)}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors flex items-center gap-2"
                    >
                      {/* 순위 */}
                      <span
                        className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          i === 0
                            ? "bg-amber-400 text-amber-950"
                            : i === 1
                              ? "bg-gray-300 text-gray-800"
                              : i === 2
                                ? "bg-orange-300 text-orange-900"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {i + 1}
                      </span>
                      {/* 마을명 */}
                      <span className="flex-1 min-w-0 text-[11px] font-medium text-gray-800 truncate">
                        {placeParts.length > 0 ? <AddrLine parts={placeParts} /> : row.geocode_address}
                      </span>
                      {/* 잔여 용량 */}
                      <span className="text-[11px] font-bold text-blue-600 tabular-nums whitespace-nowrap">
                        {formatKw(row.max_remaining_kw)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
