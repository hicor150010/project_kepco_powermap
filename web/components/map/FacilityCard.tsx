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
    <div className="bg-white border border-gray-200 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] text-gray-500">{title}</div>
          <div className="text-sm font-semibold text-gray-900">{name}</div>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            ok ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
          }`}
        >
          {ok ? "여유" : "없음"}
        </span>
      </div>
      <div className="space-y-0.5 text-[11px] border-t border-gray-100 pt-2">
        <div className="flex justify-between text-gray-600">
          <span>기준</span>
          <span className="font-mono text-gray-900 tabular-nums">
            {formatPower(base ?? 0)}
          </span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>접수</span>
          <span className="font-mono text-gray-900 tabular-nums">
            {formatPower(received ?? 0)}
          </span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>계획</span>
          <span className="font-mono text-gray-900 tabular-nums">
            {formatPower(planned ?? 0)}
          </span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <span
          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
            remainingOk
              ? "bg-blue-100 text-blue-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {remainingOk ? "여유 " : "초과 "}
          {formatPower(Math.abs(remaining))}
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
    <div className="bg-gray-50 rounded px-2 py-1.5 text-center">
      <div className="text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900 tabular-nums">{cnt ?? 0}건</div>
      {pwr != null && pwr > 0 && (
        <div className="text-[10px] text-gray-500 tabular-nums">
          {formatPower(pwr)}
        </div>
      )}
    </div>
  );
}
