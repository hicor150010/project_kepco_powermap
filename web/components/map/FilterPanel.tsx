"use client";

import { useState, useMemo, useEffect } from "react";
import ChipToggle from "./ChipToggle";
import type { MapSummaryRow, ColumnFilters as Filters } from "@/lib/types";
import { emptyFilters } from "@/lib/types";
import { matchesVolumeFilter } from "@/lib/filterUtil";

interface Props {
  totalRows: MapSummaryRow[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** "여유 있는 곳만 보기" 활성 여부 */
  isPromisingMode?: boolean;
  /** "여유 있는 곳만 보기" 토글 */
  onTogglePromising?: () => void;
}

/**
 * 여유용량 토글 — 4단 라디오.
 *   전체 · 전부 여유 · 일부 부족 · 전부 부족
 * 마커의 비율 막대 모델과 동일한 카테고리이므로 직관적이다.
 */
function VolumeToggle({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: Set<string>;
  onChange: (v: Set<string>) => void;
}) {
  const isAll = selected.size === 0;
  const has = (v: string) => selected.has(v);
  // 라디오 동작: 같은 값을 다시 누르면 해제(전체로)
  const pick = (v: string) => {
    if (selected.size === 1 && has(v)) onChange(new Set());
    else onChange(new Set([v]));
  };

  const btn = (active: boolean, color: "default" | "blue" | "amber" | "red") => {
    const activeCls =
      color === "blue"
        ? "bg-blue-500 border-blue-500 text-white"
        : color === "amber"
          ? "bg-amber-500 border-amber-500 text-white"
          : color === "red"
            ? "bg-red-500 border-red-500 text-white"
            : "bg-gray-700 border-gray-700 text-white";
    return `flex-1 px-1 py-1.5 text-[10px] rounded border transition-colors font-medium ${
      active ? activeCls : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
    }`;
  };

  return (
    <div>
      <div className="text-[11px] font-medium text-gray-700 mb-1">{label}</div>
      <div className="flex gap-1">
        <button onClick={() => onChange(new Set())} className={btn(isAll, "default")}>
          전체
        </button>
        <button onClick={() => pick("전부 여유")} className={btn(has("전부 여유"), "blue")}>
          전부 여유
        </button>
        <button onClick={() => pick("일부 부족")} className={btn(has("일부 부족"), "amber")}>
          일부 부족
        </button>
        <button onClick={() => pick("전부 부족")} className={btn(has("전부 부족"), "red")}>
          전부 부족
        </button>
      </div>
    </div>
  );
}

export default function FilterPanel({ totalRows, filters, onChange, isPromisingMode, onTogglePromising }: Props) {
  const [expanded, setExpanded] = useState(true);

  // 0. 여유용량(1차) 필터 적용
  const volumeFiltered = useMemo(() => {
    return totalRows.filter((r) => {
      if (!matchesVolumeFilter(r.subst_no_cap, r.total, filters.vol_subst))
        return false;
      if (!matchesVolumeFilter(r.mtr_no_cap, r.total, filters.vol_mtr))
        return false;
      if (!matchesVolumeFilter(r.dl_no_cap, r.total, filters.vol_dl))
        return false;
      return true;
    });
  }, [totalRows, filters.vol_subst, filters.vol_mtr, filters.vol_dl]);

  // 1. 시/도 옵션 — 여유용량 필터 결과 기준
  const addrDoOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => r.addr_do && set.add(r.addr_do));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered]);

  // 2. 시/군/구 옵션 — 시/도 선택 반영
  const addrGuOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do)))
        return;
      if (r.addr_gu) set.add(r.addr_gu);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered, filters.addr_do]);

  // 3. 동/면 옵션 — 시/도 + 시/군/구 반영
  const addrDongOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do)))
        return;
      if (filters.addr_gu.size > 0 && (!r.addr_gu || !filters.addr_gu.has(r.addr_gu)))
        return;
      if (r.addr_dong) set.add(r.addr_dong);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered, filters.addr_do, filters.addr_gu]);

  // 4. 리 옵션 — 시/도 + 시/군/구 + 동/면 반영
  const addrLiOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do)))
        return;
      if (filters.addr_gu.size > 0 && (!r.addr_gu || !filters.addr_gu.has(r.addr_gu)))
        return;
      if (filters.addr_dong.size > 0 && (!r.addr_dong || !filters.addr_dong.has(r.addr_dong)))
        return;
      if (r.addr_li) set.add(r.addr_li);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered, filters.addr_do, filters.addr_gu, filters.addr_dong]);

  // 5. 변전소/배전선로 옵션 — 모든 주소 필터 반영
  const facilityOptions = useMemo(() => {
    const substSet = new Set<string>();
    const dlSet = new Set<string>();
    volumeFiltered.forEach((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do)))
        return;
      if (filters.addr_gu.size > 0 && (!r.addr_gu || !filters.addr_gu.has(r.addr_gu)))
        return;
      if (filters.addr_dong.size > 0 && (!r.addr_dong || !filters.addr_dong.has(r.addr_dong)))
        return;
      if (filters.addr_li.size > 0 && (!r.addr_li || !filters.addr_li.has(r.addr_li)))
        return;
      r.subst_names?.forEach((n) => n && substSet.add(n));
      r.dl_names?.forEach((n) => n && dlSet.add(n));
    });
    const sort = (s: Set<string>) =>
      Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
    return { subst_nm: sort(substSet), dl_nm: sort(dlSet) };
  }, [
    volumeFiltered,
    filters.addr_do,
    filters.addr_gu,
    filters.addr_dong,
    filters.addr_li,
  ]);

  const options = {
    addr_do: addrDoOptions,
    addr_gu: addrGuOptions,
    addr_dong: addrDongOptions,
    addr_li: addrLiOptions,
    subst_nm: facilityOptions.subst_nm,
    dl_nm: facilityOptions.dl_nm,
  };

  // 카스케이딩: 상위 필터 변경 시 더 이상 유효하지 않은 하위 선택 정리
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
    const dong = prune(filters.addr_dong, options.addr_dong);
    if (dong) updates.addr_dong = dong;
    const li = prune(filters.addr_li, options.addr_li);
    if (li) updates.addr_li = li;
    const c = prune(filters.subst_nm, options.subst_nm);
    if (c) updates.subst_nm = c;
    const d = prune(filters.dl_nm, options.dl_nm);
    if (d) updates.dl_nm = d;

    if (Object.keys(updates).length > 0) {
      onChange({ ...filters, ...updates });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.addr_do.length,
    options.addr_gu.length,
    options.addr_dong.length,
    options.addr_li.length,
    options.subst_nm.length,
    options.dl_nm.length,
  ]);

  const activeCount = Object.values(filters).reduce(
    (sum, set) => sum + (set.size > 0 ? 1 : 0),
    0
  );

  const reset = () => onChange(emptyFilters());
  const update = (key: keyof Filters, value: Set<string>) =>
    onChange({ ...filters, [key]: value });

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
        <div className="px-5 pb-4 space-y-4">
          {/* 1차: 여유용량 */}
          <div className="border-2 border-blue-300 -mx-2 px-3 py-3.5 rounded-lg space-y-2.5 bg-blue-50/40 shadow-sm">
            <div className="text-sm font-bold text-blue-800 flex items-center gap-1.5 pb-2 border-b border-blue-200">
              <span className="text-base">📊</span> 여유용량 상태
            </div>
            {onTogglePromising && (
              <button
                type="button"
                onClick={onTogglePromising}
                className={`w-full rounded-md px-3 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  isPromisingMode
                    ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300"
                    : "bg-white hover:bg-amber-50 text-gray-600 border border-gray-200 hover:border-amber-200"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isPromisingMode ? "bg-amber-500" : "bg-gray-400"}`} />
                {isPromisingMode ? "여유 있는 곳만 보는 중" : "여유 있는 곳만 보기"}
                {isPromisingMode && <span className="text-[10px] text-amber-400 ml-auto">✕</span>}
              </button>
            )}
            <VolumeToggle
              label="변전소"
              selected={filters.vol_subst}
              onChange={(v) => update("vol_subst", v)}
            />
            <VolumeToggle
              label="주변압기"
              selected={filters.vol_mtr}
              onChange={(v) => update("vol_mtr", v)}
            />
            <VolumeToggle
              label="배전선로"
              selected={filters.vol_dl}
              onChange={(v) => update("vol_dl", v)}
            />
          </div>

          {/* 2차: 지역 */}
          <div className="border-2 border-gray-300 -mx-2 px-3 py-3.5 rounded-lg space-y-3 bg-white shadow-sm">
            <div className="text-sm font-bold text-gray-800 flex items-center gap-1.5 pb-2 border-b border-gray-200">
              <span className="text-base">🗺</span> 지역
              {(filters.addr_do.size > 0 || filters.addr_gu.size > 0 || filters.addr_dong.size > 0 || filters.addr_li.size > 0) && (
                <button
                  onClick={() => onChange({ ...filters, addr_do: new Set(), addr_gu: new Set(), addr_dong: new Set(), addr_li: new Set() })}
                  className="ml-auto text-[10px] font-normal text-gray-400 hover:text-red-500 transition-colors"
                >
                  지역 초기화
                </button>
              )}
            </div>
            <ChipToggle
              label="시/도"
              options={options.addr_do}
              selected={filters.addr_do}
              onChange={(v) => update("addr_do", v)}
            />
            <ChipToggle
              label="시/군/구"
              options={options.addr_gu}
              selected={filters.addr_gu}
              onChange={(v) => update("addr_gu", v)}
              searchable
            />
            <ChipToggle
              label="동/면"
              options={options.addr_dong}
              selected={filters.addr_dong}
              onChange={(v) => update("addr_dong", v)}
              searchable
            />
            <ChipToggle
              label="리"
              options={options.addr_li}
              selected={filters.addr_li}
              onChange={(v) => update("addr_li", v)}
              searchable
              maxHeight="160px"
            />
          </div>

          {/* 3차: 설비 */}
          <div className="border-2 border-gray-300 -mx-2 px-3 py-3.5 rounded-lg space-y-3 bg-white shadow-sm">
            <div className="text-sm font-bold text-gray-800 flex items-center gap-1.5 pb-2 border-b border-gray-200">
              <span className="text-base">⚡</span> 설비
              {(filters.subst_nm.size > 0 || filters.dl_nm.size > 0) && (
                <button
                  onClick={() => onChange({ ...filters, subst_nm: new Set(), dl_nm: new Set() })}
                  className="ml-auto text-[10px] font-normal text-gray-400 hover:text-red-500 transition-colors"
                >
                  설비 초기화
                </button>
              )}
            </div>
            <ChipToggle
              label="변전소명"
              options={options.subst_nm}
              selected={filters.subst_nm}
              onChange={(v) => update("subst_nm", v)}
              searchable
              maxHeight="140px"
            />
            <ChipToggle
              label="배전선로명"
              options={options.dl_nm}
              selected={filters.dl_nm}
              onChange={(v) => update("dl_nm", v)}
              searchable
              maxHeight="140px"
            />
          </div>
        </div>
      )}
    </div>
  );
}
