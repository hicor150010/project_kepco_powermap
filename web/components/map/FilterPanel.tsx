"use client";

import { useState, useMemo, useEffect } from "react";
import ChipToggle from "./ChipToggle";
import SearchResultList, { type SearchPick } from "./SearchResultList";
import type { MapSummaryRow, ColumnFilters as Filters } from "@/lib/types";
import type { SearchRiResult } from "@/lib/search/searchKepco";
import { emptyFilters } from "@/lib/types";
import { matchesVolumeFilter } from "@/lib/filterUtil";

interface Props {
  totalRows: MapSummaryRow[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  isPromisingMode?: boolean;
  onTogglePromising?: () => void;
  onSearchPick?: (pick: SearchPick) => void;
}

/** 여유용량 토글 — 콤팩트 1줄 레이아웃 */
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
    return `px-1.5 py-1 text-[10px] rounded border transition-colors font-medium ${
      active ? activeCls : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
    }`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-gray-600 w-14 flex-shrink-0">{label}</span>
      <div className="flex gap-1 flex-1">
        <button onClick={() => onChange(new Set())} className={btn(isAll, "default")}>전체</button>
        <button onClick={() => pick("전부 여유")} className={btn(has("전부 여유"), "blue")}>전부 여유</button>
        <button onClick={() => pick("일부 부족")} className={btn(has("일부 부족"), "amber")}>일부 부족</button>
        <button onClick={() => pick("전부 부족")} className={btn(has("전부 부족"), "red")}>전부 부족</button>
      </div>
    </div>
  );
}

type SortKey = "remaining_desc" | "count_desc" | "name_asc";

export default function FilterPanel({
  totalRows, filters, onChange,
  isPromisingMode, onTogglePromising, onSearchPick,
}: Props) {
  const [showResults, setShowResults] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("remaining_desc");
  const [detailRegionOpen, setDetailRegionOpen] = useState(false);

  // ── 옵션 계산 (기존 로직 유지) ──

  const volumeFiltered = useMemo(() => {
    return totalRows.filter((r) => {
      if (!matchesVolumeFilter(r.subst_no_cap, r.total, filters.cap_subst)) return false;
      if (!matchesVolumeFilter(r.mtr_no_cap, r.total, filters.cap_mtr)) return false;
      if (!matchesVolumeFilter(r.dl_no_cap, r.total, filters.cap_dl)) return false;
      return true;
    });
  }, [totalRows, filters.cap_subst, filters.cap_mtr, filters.cap_dl]);

  const addrDoOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => r.addr_do && set.add(r.addr_do));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered]);

  const addrGuOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do))) return;
      if (r.addr_gu) set.add(r.addr_gu);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered, filters.addr_do]);

  const addrDongOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do))) return;
      if (filters.addr_gu.size > 0 && (!r.addr_gu || !filters.addr_gu.has(r.addr_gu))) return;
      if (r.addr_dong) set.add(r.addr_dong);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered, filters.addr_do, filters.addr_gu]);

  const addrLiOptions = useMemo(() => {
    const set = new Set<string>();
    volumeFiltered.forEach((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do))) return;
      if (filters.addr_gu.size > 0 && (!r.addr_gu || !filters.addr_gu.has(r.addr_gu))) return;
      if (filters.addr_dong.size > 0 && (!r.addr_dong || !filters.addr_dong.has(r.addr_dong))) return;
      if (r.addr_li) set.add(r.addr_li);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [volumeFiltered, filters.addr_do, filters.addr_gu, filters.addr_dong]);

  // 카스케이딩: 상위 필터 변경 시 하위 선택 정리
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
    const a = prune(filters.addr_do, addrDoOptions);
    if (a) updates.addr_do = a;
    const b = prune(filters.addr_gu, addrGuOptions);
    if (b) updates.addr_gu = b;
    const dong = prune(filters.addr_dong, addrDongOptions);
    if (dong) updates.addr_dong = dong;
    const li = prune(filters.addr_li, addrLiOptions);
    if (li) updates.addr_li = li;

    if (Object.keys(updates).length > 0) {
      onChange({ ...filters, ...updates });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addrDoOptions.length,
    addrGuOptions.length,
    addrDongOptions.length,
    addrLiOptions.length,
  ]);

  const activeCount = (
    (filters.cap_subst.size > 0 ? 1 : 0) +
    (filters.cap_mtr.size > 0 ? 1 : 0) +
    (filters.cap_dl.size > 0 ? 1 : 0) +
    (filters.addr_do.size > 0 ? 1 : 0) +
    (filters.addr_gu.size > 0 ? 1 : 0) +
    (filters.addr_dong.size > 0 ? 1 : 0) +
    (filters.addr_li.size > 0 ? 1 : 0)
  );

  const update = (key: keyof Filters, value: Set<string>) =>
    onChange({ ...filters, [key]: value });

  const reset = () => {
    onChange(emptyFilters());
    setSortKey("remaining_desc");
    setShowResults(false);
  };

  // ── 조건검색: 모든 필터 적용된 결과 (내부 계산) ──

  const filteredRows = useMemo(() => {
    return volumeFiltered.filter((r) => {
      if (filters.addr_do.size > 0 && (!r.addr_do || !filters.addr_do.has(r.addr_do))) return false;
      if (filters.addr_gu.size > 0 && (!r.addr_gu || !filters.addr_gu.has(r.addr_gu))) return false;
      if (filters.addr_dong.size > 0 && (!r.addr_dong || !filters.addr_dong.has(r.addr_dong))) return false;
      if (filters.addr_li.size > 0 && (!r.addr_li || !filters.addr_li.has(r.addr_li))) return false;
      return true;
    });
  }, [volumeFiltered, filters.addr_do, filters.addr_gu, filters.addr_dong, filters.addr_li]);

  const conditionResults: SearchRiResult[] = useMemo(() => {
    if (!showResults) return [];

    const kwMap = new Map(filteredRows.map((r) => [r.geocode_address, r.max_remaining_kw]));
    const mapped: SearchRiResult[] = filteredRows.map((r) => ({
      addr_do: r.addr_do,
      addr_si: r.addr_si,
      addr_gu: r.addr_gu,
      addr_dong: r.addr_dong,
      addr_li: r.addr_li,
      geocode_address: r.geocode_address,
      cnt: r.total,
      lat: r.lat,
      lng: r.lng,
    }));

    switch (sortKey) {
      case "remaining_desc":
        mapped.sort((a, b) => (kwMap.get(b.geocode_address) ?? 0) - (kwMap.get(a.geocode_address) ?? 0));
        break;
      case "count_desc":
        mapped.sort((a, b) => b.cnt - a.cnt);
        break;
      case "name_asc":
        mapped.sort((a, b) => a.geocode_address.localeCompare(b.geocode_address, "ko"));
        break;
    }

    return mapped;
  }, [filteredRows, showResults, sortKey]);

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-3 py-3 space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700">조건 설정</span>
          {activeCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                {activeCount}
              </span>
              <button onClick={reset} className="text-[10px] text-gray-400 hover:text-red-500">
                초기화
              </button>
            </div>
          )}
        </div>

        {/* 여유용량 */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
            <span>📊</span> 여유용량
          </div>
          {onTogglePromising && (
            <button
              type="button"
              onClick={onTogglePromising}
              className={`w-full rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
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
          <VolumeToggle label="변전소" selected={filters.cap_subst} onChange={(v) => update("cap_subst", v)} />
          <VolumeToggle label="주변압기" selected={filters.cap_mtr} onChange={(v) => update("cap_mtr", v)} />
          <VolumeToggle label="배전선로" selected={filters.cap_dl} onChange={(v) => update("cap_dl", v)} />
        </div>

        {/* 지역 */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
            <span>🗺</span> 지역
            {(filters.addr_do.size > 0 || filters.addr_gu.size > 0 || filters.addr_dong.size > 0 || filters.addr_li.size > 0) && (
              <button
                onClick={() => onChange({ ...filters, addr_do: new Set(), addr_gu: new Set(), addr_dong: new Set(), addr_li: new Set() })}
                className="ml-auto text-[10px] font-normal text-gray-400 hover:text-red-500"
              >
                초기화
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-600 w-10 flex-shrink-0">시/도</label>
            <select
              value={filters.addr_do.size > 0 ? [...filters.addr_do][0] : ""}
              onChange={(e) => update("addr_do", e.target.value ? new Set([e.target.value]) : new Set())}
              className="flex-1 text-xs text-gray-900 border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
            >
              <option value="">전체</option>
              {addrDoOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-600 w-10 flex-shrink-0">시/군</label>
            <select
              value={filters.addr_gu.size > 0 ? [...filters.addr_gu][0] : ""}
              onChange={(e) => update("addr_gu", e.target.value ? new Set([e.target.value]) : new Set())}
              className="flex-1 text-xs text-gray-900 border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
            >
              <option value="">전체</option>
              {addrGuOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* 상세지역설정 */}
          <button
            type="button"
            onClick={() => setDetailRegionOpen(!detailRegionOpen)}
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <span className={`transition-transform text-[10px] ${detailRegionOpen ? "rotate-90" : ""}`}>▶</span>
            상세지역설정
            {(filters.addr_dong.size > 0 || filters.addr_li.size > 0) && (
              <span className="bg-blue-500 text-white text-[9px] px-1 rounded-full ml-1">
                {filters.addr_dong.size + filters.addr_li.size}
              </span>
            )}
          </button>
          {detailRegionOpen && (
            <div className="space-y-2 pl-2 border-l-2 border-blue-200">
              <ChipToggle label="동/면" options={addrDongOptions} selected={filters.addr_dong} onChange={(v) => update("addr_dong", v)} searchable />
              <ChipToggle label="리" options={addrLiOptions} selected={filters.addr_li} onChange={(v) => update("addr_li", v)} searchable maxHeight="160px" />
            </div>
          )}
        </div>

        {/* 정렬 */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-gray-600 w-10 flex-shrink-0">정렬</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="flex-1 text-xs text-gray-900 border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
          >
            <option value="remaining_desc">잔여용량 큰 순</option>
            <option value="count_desc">건수 많은 순</option>
            <option value="name_asc">가나다순</option>
          </select>
        </div>

        {/* 검색 버튼 */}
        <button
          type="button"
          onClick={() => setShowResults(true)}
          className="w-full py-2 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
        >
          검색 ({filteredRows.length.toLocaleString()}개 마을)
        </button>
      </div>

      {/* 결과 리스트 */}
      {showResults && (
        <div className="border-t border-gray-200">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-600">
              결과 {conditionResults.length.toLocaleString()}개 마을
            </span>
            <button
              type="button"
              onClick={() => setShowResults(false)}
              className="text-[10px] text-gray-400 hover:text-gray-600"
            >
              접기
            </button>
          </div>
          <SearchResultList
            mode="ri"
            ri={conditionResults}
            ji={[]}
            onPick={(pick) => onSearchPick?.(pick)}
          />
        </div>
      )}
    </div>
  );
}
