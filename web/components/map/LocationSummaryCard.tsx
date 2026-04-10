"use client";

/**
 * 마을 요약 카드.
 *
 * 핵심 의도:
 *   원본 데이터는 "지번 단위" 1행 = 1지번이지만, 화면에서는 어쩔 수 없이
 *   "리(마을)" 단위로 묶어서 본다. 이때 사용자가 가장 알고 싶어하는 건
 *
 *     "이 마을의 N개 데이터 중, 변전소가 부족한 건 몇 건인가?"
 *
 *   따라서 카드의 핵심은 "행 단위 카운트 비율" 이다.
 *   - 시설명 나열 X
 *   - 기준/접수/계획 같은 세부 수치 X (상세 모달에서 확인)
 *   - 변전소/주변압기/배전선로 각각의 여유/부족 비율을 한눈에
 */

import { useMemo } from "react";
import type { KepcoDataRow } from "@/lib/types";
import { summarizeLocation, type FacilityCounts } from "@/lib/summarize";
import AddrLine from "./AddrLine";

interface Props {
  rows: KepcoDataRow[] | null;
  loading: boolean;
  onShowDetail: () => void;
  onClose: () => void;
}

export default function LocationSummaryCard({
  rows,
  loading,
  onShowDetail,
  onClose,
}: Props) {
  if (loading || !rows || rows.length === 0) {
    return (
      <div className="absolute left-4 bottom-4 w-[380px] max-w-[calc(100%-32px)] bg-white rounded-xl shadow-2xl border border-gray-200 p-6 z-10 kepco-slide-up">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {loading ? "마을 정보를 불러오는 중..." : "데이터 없음"}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  const summary = useMemo(() => summarizeLocation(rows), [rows]);
  const first = rows[0];
  const locationParts = [
    first.addr_do,
    first.addr_si,
    first.addr_gu,
    first.addr_dong,
    first.addr_li,
  ].filter(Boolean) as string[];

  return (
    <div className="absolute left-4 bottom-4 w-[380px] max-w-[calc(100%-32px)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-10 flex flex-col max-h-[calc(100vh-120px)] kepco-slide-up">
      {/* 헤더 — 위치명 + 총 건수 */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-start justify-between gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-gray-500 mb-0.5">이 마을 요약</div>
          <div className="font-semibold text-sm text-gray-900 truncate">
            <AddrLine parts={locationParts} />
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            데이터{" "}
            <span className="font-bold text-gray-900">
              {summary.total.toLocaleString()}건
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      {/* 본문 — 시설 종류별 비율 막대 3개 */}
      <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
        <FacilityRatio title="변전소" counts={summary.substCounts} />
        <FacilityRatio title="주변압기" counts={summary.mtrCounts} />
        <FacilityRatio title="배전선로" counts={summary.dlCounts} />
      </div>

      {/* 푸터 — 상세 보기 버튼 */}
      <div className="px-4 py-3 border-t bg-gray-50 flex-shrink-0">
        <button
          onClick={onShowDetail}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          상세 목록 보기 ({summary.total.toLocaleString()}건)
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * 시설 종류 1개의 여유/부족 비율을 막대로 표시.
 *
 *   변전소
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   [████████████████████]  ← stacked bar (blue + red)
 *   🔵 여유 50건 (54%)   🔴 부족 43건 (46%)
 */
function FacilityRatio({
  title,
  counts,
}: {
  title: string;
  counts: FacilityCounts;
}) {
  const { total, okCount, noCount, okPct, noPct } = counts;

  // 한눈 결론 라벨 — 모두 여유 / 모두 부족 / 혼재
  let verdict: { label: string; cls: string };
  if (total === 0) {
    verdict = { label: "데이터 없음", cls: "bg-gray-100 text-gray-500" };
  } else if (noCount === 0) {
    verdict = { label: "전부 여유", cls: "bg-blue-50 text-blue-700" };
  } else if (okCount === 0) {
    verdict = { label: "전부 부족", cls: "bg-red-50 text-red-700" };
  } else {
    verdict = {
      label: noPct >= okPct ? "부족 많음" : "여유 많음",
      cls:
        noPct >= okPct
          ? "bg-amber-50 text-amber-700"
          : "bg-blue-50 text-blue-700",
    };
  }

  return (
    <div>
      {/* 헤더 — 시설명 + 결론 배지 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-bold text-gray-800">{title}</div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${verdict.cls}`}
        >
          {verdict.label}
        </span>
      </div>

      {/* 비율 막대 — 여유(파랑) + 부족(빨강) 누적 */}
      <div className="h-3 w-full rounded-full overflow-hidden bg-gray-100 flex">
        {okPct > 0 && (
          <div
            className="bg-blue-500 h-full transition-all"
            style={{ width: `${okPct}%` }}
            title={`여유 ${okCount}건 (${okPct}%)`}
          />
        )}
        {noPct > 0 && (
          <div
            className="bg-red-500 h-full transition-all"
            style={{ width: `${noPct}%` }}
            title={`부족 ${noCount}건 (${noPct}%)`}
          />
        )}
      </div>

      {/* 카운트 라벨 — 여유 / 부족 한 줄 */}
      <div className="flex items-center justify-between mt-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-gray-600">여유</span>
          <span className="font-bold text-blue-600 tabular-nums">
            {okCount.toLocaleString()}건
          </span>
          <span className="text-gray-400 tabular-nums">({okPct}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-gray-600">부족</span>
          <span className="font-bold text-red-600 tabular-nums">
            {noCount.toLocaleString()}건
          </span>
          <span className="text-gray-400 tabular-nums">({noPct}%)</span>
        </div>
      </div>
    </div>
  );
}
