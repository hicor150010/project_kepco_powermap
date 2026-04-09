"use client";

import { useState, useMemo, useEffect } from "react";
import MultiSelectDropdown from "./MultiSelectDropdown";
import { uniqueValues } from "@/lib/applyFilters";
import type { LocationData, ColumnFilters as Filters } from "@/lib/types";
import { emptyFilters } from "@/lib/types";

/** "여유용량 있음" / "여유용량 없음" → 짧은 라벨 */
function shortVolLabel(v: string): string {
  if (v.includes("있음")) return "있음";
  if (v.includes("없음")) return "없음";
  return v;
}

/** 인라인 여유용량 토글 (전체 / 있음 / 없음 버튼식) */
function VolumeToggle({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (v: Set<string>) => void;
}) {
  const isAll = selected.size === 0;
  const pick = (opt: string) => {
    // 라디오 방식: 단일 선택, 같은 버튼 다시 누르면 전체로 복귀
    if (selected.size === 1 && selected.has(opt)) onChange(new Set());
    else onChange(new Set([opt]));
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-gray-700 w-14 flex-shrink-0">
        {label}
      </span>
      <div className="flex gap-1 flex-1">
        <button
          onClick={() => onChange(new Set())}
          className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
            isAll
              ? "bg-gray-700 border-gray-700 text-white font-medium"
              : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          전체
        </button>
        {options.map((opt) => {
          const active = selected.has(opt);
          const isYes = opt.includes("있음");
          return (
            <button
              key={opt}
              onClick={() => pick(opt)}
              className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                active
                  ? isYes
                    ? "bg-blue-500 border-blue-500 text-white font-medium"
                    : "bg-red-500 border-red-500 text-white font-medium"
                  : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {shortVolLabel(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ColumnFiltersProps {
  data: LocationData[];          // 전체 데이터 (옵션 추출용)
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function ColumnFilters({
  data,
  filters,
  onChange,
}: ColumnFiltersProps) {
  const [expanded, setExpanded] = useState(true);

  // 1차 필터(여유용량)만 적용한 부분집합
  // 2차 필터(지역/설비)의 옵션은 이 부분집합에서 추출 → 카스케이딩
  const volumeFiltered = useMemo(
    () =>
      data.filter((item) => {
        if (filters.vol_subst.size > 0 && !filters.vol_subst.has(item.vol_subst)) return false;
        if (filters.vol_mtr.size > 0 && !filters.vol_mtr.has(item.vol_mtr)) return false;
        if (filters.vol_dl.size > 0 && !filters.vol_dl.has(item.vol_dl)) return false;
        return true;
      }),
    [data, filters.vol_subst, filters.vol_mtr, filters.vol_dl]
  );

  const options = useMemo(
    () => ({
      // 여유용량 옵션 — 전체 데이터 기준 (항상 고정)
      vol_subst: uniqueValues(data, "vol_subst"),
      vol_mtr: uniqueValues(data, "vol_mtr"),
      vol_dl: uniqueValues(data, "vol_dl"),
      // 지역/설비 옵션 — 여유용량 필터 적용 결과 기준 (카스케이딩)
      addr_do: uniqueValues(volumeFiltered, "addr_do"),
      addr_gu: uniqueValues(volumeFiltered, "addr_gu"),
      subst_nm: uniqueValues(volumeFiltered, "subst_nm"),
      dl_nm: uniqueValues(volumeFiltered, "dl_nm"),
    }),
    [data, volumeFiltered]
  );

  // 카스케이딩: 1차(여유용량) 변경으로 더이상 선택지가 없는 2차 선택값 정리
  useEffect(() => {
    const prune = (selected: Set<string>, valid: string[]): Set<string> | null => {
      if (selected.size === 0) return null;
      const validSet = new Set(valid);
      let changed = false;
      const next = new Set<string>();
      selected.forEach((v) => {
        if (validSet.has(v)) next.add(v);
        else changed = true;
      });
      return changed ? next : null;
    };

    const updates: Partial<Filters> = {};
    const a = prune(filters.addr_do, options.addr_do);
    if (a) updates.addr_do = a;
    const b = prune(filters.addr_gu, options.addr_gu);
    if (b) updates.addr_gu = b;
    const c = prune(filters.subst_nm, options.subst_nm);
    if (c) updates.subst_nm = c;
    const d = prune(filters.dl_nm, options.dl_nm);
    if (d) updates.dl_nm = d;

    if (Object.keys(updates).length > 0) {
      onChange({ ...filters, ...updates });
    }
    // options 변화를 감지: 1차 필터 변경 시에만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.addr_do, options.addr_gu, options.subst_nm, options.dl_nm]);

  const activeCount = Object.values(filters).reduce(
    (sum, set) => sum + (set.size > 0 ? 1 : 0),
    0
  );

  const reset = () => {
    onChange(emptyFilters());
  };

  const update = (key: keyof Filters, value: Set<string>) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="border-b border-gray-200">
      <div className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <span className="text-xs font-bold text-gray-700">상세 필터</span>
          {activeCount > 0 && (
            <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
              {activeCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={reset}
              className="text-[10px] text-gray-500 hover:text-gray-700"
            >
              초기화
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "접기" : "펴기"}
          >
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-4 space-y-3">
          {/* 1차: 여유용량 상태 (최우선 필터) */}
          <div className="bg-blue-50/60 -mx-2 px-2.5 py-3 rounded-md space-y-2.5">
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">
              여유용량 상태
            </div>
            <VolumeToggle
              label="변전소"
              options={options.vol_subst}
              selected={filters.vol_subst}
              onChange={(v) => update("vol_subst", v)}
            />
            <VolumeToggle
              label="주변압기"
              options={options.vol_mtr}
              selected={filters.vol_mtr}
              onChange={(v) => update("vol_mtr", v)}
            />
            <VolumeToggle
              label="배전선로"
              options={options.vol_dl}
              selected={filters.vol_dl}
              onChange={(v) => update("vol_dl", v)}
            />
          </div>

          {/* 2차: 지역 / 설비 (1차 결과 안에서 좁히기) */}
          <div className="space-y-2.5 pt-1">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
              지역 / 설비
            </div>
            <MultiSelectDropdown
              label="시/도"
              options={options.addr_do}
              selected={filters.addr_do}
              onChange={(v) => update("addr_do", v)}
            />
            <MultiSelectDropdown
              label="시/군/구"
              options={options.addr_gu}
              selected={filters.addr_gu}
              onChange={(v) => update("addr_gu", v)}
              searchable
            />
            <MultiSelectDropdown
              label="변전소명"
              options={options.subst_nm}
              selected={filters.subst_nm}
              onChange={(v) => update("subst_nm", v)}
              searchable
            />
            <MultiSelectDropdown
              label="배전선로명"
              options={options.dl_nm}
              selected={filters.dl_nm}
              onChange={(v) => update("dl_nm", v)}
              searchable
            />
          </div>
        </div>
      )}
    </div>
  );
}
