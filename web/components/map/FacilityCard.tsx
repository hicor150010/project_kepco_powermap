"use client";

/**
 * 시설 카드 — 변전소/주변압기/배전선로 한 시설의 용량 요약을 보여준다.
 *
 * 한 곳에서 정의해 두고 LocationDetailModal과 SearchResultList(검색 인라인 펼침) 양쪽이
 * 동일한 룩앤필로 사용한다. (UI 일관성 + 단일 정의)
 */

import { formatPower } from "@/lib/summarize";

interface FacilityCardProps {
  title: string;
  name: string;
  ok: boolean;
  base: number | null;
  received: number | null;
  planned: number | null;
}

export function FacilityCard({
  title,
  name,
  ok,
  base,
  received,
  planned,
}: FacilityCardProps) {
  const remaining = (base ?? 0) - (received ?? 0);
  const remainingOk = remaining > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-md px-3 py-2">
      {/* 1행: 타이틀 + 이름 + 여유/없음 배지 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-gray-400">{title}</span>
          <span className="text-xs font-bold text-gray-900 truncate">{name}</span>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
            ok ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
          }`}
        >
          {ok ? "여유" : "없음"}
        </span>
      </div>
      {/* 2행: 기준·접수·계획 + 여유량 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px]">
        <span className="whitespace-nowrap"><span className="text-gray-500">기준</span> <span className="font-mono text-gray-700 tabular-nums">{formatPower(base ?? 0)}</span></span>
        <span className="whitespace-nowrap"><span className="text-blue-500">접수</span> <span className="font-mono text-gray-700 tabular-nums">{formatPower(received ?? 0)}</span></span>
        <span className="whitespace-nowrap"><span className="text-amber-500">계획</span> <span className="font-mono text-gray-700 tabular-nums">{formatPower(planned ?? 0)}</span></span>
        <span
          className={`whitespace-nowrap ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
            remainingOk ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
          }`}
        >
          {remainingOk ? "여유 " : "초과 "}{formatPower(Math.abs(remaining))}
        </span>
      </div>
    </div>
  );
}

interface StepBlockProps {
  label: string;
  cnt: number | null;
  pwr: number | null;
}

export function StepBlock({ label, cnt, pwr }: StepBlockProps) {
  return (
    <div className="bg-gray-50 rounded px-2 py-1 flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900 tabular-nums">
        {cnt ?? 0}건
        {pwr != null && pwr > 0 && (
          <span className="text-[10px] text-gray-400 font-normal ml-1">({formatPower(pwr)})</span>
        )}
      </span>
    </div>
  );
}
