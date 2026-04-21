"use client";

/**
 * 필지 정보 카드 (1차 1단계 — 지적편집도 ON 상태에서 지도 클릭 시 표시).
 *
 * 표시 항목 (의뢰자 요구):
 *   - 주소 + 지번 + 지목
 *   - 면적 (㎡ / 평 환산)
 *   - KEPCO 여유선로 3줄 (변전소/주변압기/배전선로)
 *   - 필지 단위 매칭 실패 시 "리 단위 대표값" 배지
 *
 * 레이아웃은 기존 LocationSummaryCard 와 톤 일치.
 */

import { useMemo } from "react";
import type { KepcoDataRow } from "@/lib/types";
import { summarizeLocation } from "@/lib/summarize";
import AddrLine from "./AddrLine";
import type { ParcelInfo } from "@/lib/vworld/parcel";

interface Props {
  parcel: ParcelInfo | null;
  capa: KepcoDataRow[];
  matchMode: "exact" | "li_fallback" | null;
  loading: boolean;
  onClose: () => void;
}

const M2_TO_PYEONG = 0.3025;

export default function ParcelInfoCard({
  parcel,
  capa,
  matchMode,
  loading,
  onClose,
}: Props) {
  // 요약은 capa 배열이 있을 때만 의미 있음. 빈 배열이면 null.
  const summary = useMemo(
    () => (capa.length > 0 ? summarizeLocation(capa) : null),
    [capa],
  );

  return (
    <div
      className="absolute left-4 right-4 bottom-4 md:left-auto md:right-4 md:bottom-4
                 md:w-[380px] max-w-[calc(100%-32px)] bg-white rounded-xl shadow-2xl
                 border border-gray-200 overflow-hidden z-10 flex flex-col
                 max-h-[calc(100dvh-80px)] kepco-slide-up"
    >
      {/* 헤더 */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 border-b bg-gray-50 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-sm text-gray-500">필지 정보 불러오는 중...</div>
          ) : !parcel ? (
            <div className="text-sm text-gray-600">이 위치에 필지 없음</div>
          ) : (
            <>
              <div className="font-semibold text-xs md:text-sm text-gray-900 truncate">
                <AddrLine
                  parts={[
                    parcel.ctp_nm,
                    parcel.sig_nm,
                    parcel.emd_nm,
                    parcel.li_nm || null,
                    parcel.jibun,
                  ].filter(Boolean) as string[]}
                />
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-medium">
                  {parcel.jimok || "-"}
                </span>
                <span>
                  {parcel.area_m2.toLocaleString()}㎡
                  <span className="text-gray-400 ml-1">
                    ({Math.round(parcel.area_m2 * M2_TO_PYEONG).toLocaleString()}평)
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      {/* KEPCO 여유선로 요약 */}
      {!loading && parcel && (
        <div className="px-3 py-3 md:px-4 md:py-3 flex-1 overflow-auto">
          {matchMode === "li_fallback" && (
            <div className="mb-2.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700 leading-snug">
              이 지번 데이터가 없어 <b>같은 리(里) 대표값</b>으로 표시합니다.
            </div>
          )}
          {!summary ? (
            <div className="text-sm text-gray-500 py-4 text-center">
              이 지역 여유선로 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              <FacilityRow
                label="변전소"
                ok={summary.substCounts.okCount}
                no={summary.substCounts.noCount}
              />
              <FacilityRow
                label="주변압기"
                ok={summary.mtrCounts.okCount}
                no={summary.mtrCounts.noCount}
              />
              <FacilityRow
                label="배전선로"
                ok={summary.dlCounts.okCount}
                no={summary.dlCounts.noCount}
              />
            </div>
          )}
          {parcel.jiga != null && parcel.jiga > 0 && (
            <div className="mt-3 pt-2 border-t text-[11px] text-gray-500">
              공시지가: {parcel.jiga.toLocaleString()}원/㎡
              <span className="text-gray-400 ml-2">
                · 필지 추정가 {Math.round((parcel.jiga * parcel.area_m2) / 10000).toLocaleString()}만원
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 시설별 여유/부족 건수 1줄 */
function FacilityRow({ label, ok, no }: { label: string; ok: number; no: number }) {
  const total = ok + no;
  if (total === 0) {
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-400 text-xs">데이터 없음</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-gray-700 font-medium">{label}</span>
      <span className="flex items-center gap-2 text-xs tabular-nums">
        {ok > 0 && (
          <span className="text-blue-600 font-semibold">
            여유 {ok}
          </span>
        )}
        {no > 0 && (
          <span className="text-red-500 font-semibold">
            부족 {no}
          </span>
        )}
        <span className="text-gray-400">/ {total}건</span>
      </span>
    </div>
  );
}
