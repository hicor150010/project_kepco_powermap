"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import RegionFilter, { applyRegionFilter, EMPTY_REGION, type RegionSelection } from "./RegionFilter";
import SearchResultList, { type SearchPick } from "./SearchResultList";
import type { MapSummaryRow, ColumnFilters as Filters, KepcoDataRow } from "@/lib/types";
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
  /** 지번 핀 표시 */
  onJibunPin?: (row: KepcoDataRow) => void;
  selectedAddr?: string | null;
  /** 지도 필터 적용 */
  onMapFilter?: (addrs: Set<string>) => void;
  /** 지도 필터 해제 */
  onClearMapFilter?: () => void;
  /** 외부에서 값이 바뀌면 1단계로 리셋 */
  resetKey?: number;
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
    return `px-1.5 py-1.5 text-[10px] rounded border transition-colors font-medium ${
      active ? activeCls : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
    }`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-gray-600 w-14 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1 flex-1">
        <button onClick={() => onChange(new Set())} className={btn(isAll, "default")}>전체</button>
        <button onClick={() => pick("전부 여유")} className={btn(has("전부 여유"), "blue")}>전부 여유</button>
        <button onClick={() => pick("일부 부족")} className={btn(has("일부 부족"), "amber")}>일부 부족</button>
        <button onClick={() => pick("전부 부족")} className={btn(has("전부 부족"), "red")}>전부 부족</button>
      </div>
    </div>
  );
}

type RiSortKey = "remaining_desc" | "count_desc" | "name_asc";
type JiSortKey = "remaining_desc" | "jibun_asc" | "name_asc";

export default function FilterPanel({
  totalRows, filters, onChange,
  isPromisingMode, onTogglePromising, onSearchPick, onJibunPin, selectedAddr,
  onMapFilter, onClearMapFilter, resetKey = 0,
}: Props) {
  const [step, setStep] = useState<"volume" | "results">("volume");
  const [step1Rows, setStep1Rows] = useState<MapSummaryRow[]>([]);
  const [riSortKey, setRiSortKey] = useState<RiSortKey>("remaining_desc");
  const [jiSortKey, setJiSortKey] = useState<JiSortKey>("remaining_desc");
  const [searchTab, setSearchTab] = useState<"ri" | "ji">("ri");
  const [jiRows, setJiRows] = useState<KepcoDataRow[]>([]);
  const [jiLoading, setJiLoading] = useState(false);
  const [region, setRegion] = useState<RegionSelection>(EMPTY_REGION);

  const update = (key: keyof Filters, value: Set<string>) =>
    onChange({ ...filters, [key]: value });

  // ── 1단계: 여유용량 필터 (버튼 카운트용) ──

  const volumeFiltered = useMemo(() => {
    return totalRows.filter((r) => {
      if (!matchesVolumeFilter(r.subst_no_cap, r.total, filters.cap_subst)) return false;
      if (!matchesVolumeFilter(r.mtr_no_cap, r.total, filters.cap_mtr)) return false;
      if (!matchesVolumeFilter(r.dl_no_cap, r.total, filters.cap_dl)) return false;
      return true;
    });
  }, [totalRows, filters.cap_subst, filters.cap_mtr, filters.cap_dl]);

  // ── 2단계: 지역 필터 적용 + 결과 ──

  const filteredRows = useMemo(() => {
    const source = step === "results" ? step1Rows : volumeFiltered;
    return applyRegionFilter(source, region);
  }, [step, step1Rows, volumeFiltered, region]);

  // 2단계 지역 필터 변경 시 지도 마커도 갱신
  const onMapFilterRef = useRef(onMapFilter);
  onMapFilterRef.current = onMapFilter;
  useEffect(() => {
    if (step !== "results") return;
    onMapFilterRef.current?.(new Set(filteredRows.map((r) => r.geocode_address)));
  }, [step, filteredRows]);

  const conditionResults: SearchRiResult[] = useMemo(() => {
    if (step !== "results") return [];

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

    switch (riSortKey) {
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
  }, [filteredRows, step, riSortKey]);

  // ── 지번 데이터 fetch ──

  const fetchJi = useCallback(async (addrs: string[]) => {
    if (addrs.length === 0) { setJiRows([]); return; }
    setJiLoading(true);
    try {
      const res = await fetch("/api/filter-ji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addrs, limit: 200 }),
      });
      if (!res.ok) throw new Error("조회 실패");
      const data = await res.json();
      setJiRows(data.rows ?? []);
    } catch {
      setJiRows([]);
    } finally {
      setJiLoading(false);
    }
  }, []);

  // 지번 정렬 (클라이언트)
  const sortedJi = useMemo(() => {
    const arr = [...jiRows];
    switch (jiSortKey) {
      case "remaining_desc": {
        // 3시설 중 최소 잔여 기준
        const minRemaining = (r: KepcoDataRow) => Math.min(
          (r.subst_capa ?? 0) - (r.subst_pwr ?? 0),
          (r.mtr_capa ?? 0) - (r.mtr_pwr ?? 0),
          (r.dl_capa ?? 0) - (r.dl_pwr ?? 0),
        );
        arr.sort((a, b) => minRemaining(b) - minRemaining(a));
        break;
      }
      case "jibun_asc": {
        const jibunNum = (j: string | null) => {
          if (!j) return Number.MAX_SAFE_INTEGER;
          const m = j.match(/\d+/);
          return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
        };
        arr.sort((a, b) => {
          const addrCmp = (a.geocode_address ?? "").localeCompare(b.geocode_address ?? "", "ko");
          if (addrCmp !== 0) return addrCmp;
          return jibunNum(a.addr_jibun) - jibunNum(b.addr_jibun);
        });
        break;
      }
      case "name_asc":
        arr.sort((a, b) => (a.geocode_address ?? "").localeCompare(b.geocode_address ?? "", "ko"));
        break;
    }
    return arr;
  }, [jiRows, jiSortKey]);

  // 지역 필터 변경 시 지번 데이터도 갱신
  const prevFilteredAddrsRef = useRef<string>("");
  useEffect(() => {
    if (step !== "results") return;
    const addrs = filteredRows.map((r) => r.geocode_address);
    const key = addrs.join(",");
    if (key === prevFilteredAddrsRef.current) return;
    prevFilteredAddrsRef.current = key;
    fetchJi(addrs);
  }, [step, filteredRows, fetchJi]);

  // ── 핸들러 ──

  const handleSearch = () => {
    const snapshot = [...volumeFiltered];
    setStep1Rows(snapshot);
    setRegion(EMPTY_REGION);
    setStep("results");
    setSearchTab("ri");
    onMapFilter?.(new Set(snapshot.map((r) => r.geocode_address)));
  };

  const handleBack = () => {
    setRegion(EMPTY_REGION);
    setStep1Rows([]);
    setJiRows([]);
    prevFilteredAddrsRef.current = "";
    setSearchTab("ri");
    setStep("volume");
    onClearMapFilter?.();
  };

  const reset = () => {
    onChange(emptyFilters());
    setRegion(EMPTY_REGION);
    setRiSortKey("remaining_desc");
    setJiSortKey("remaining_desc");
    setStep1Rows([]);
    setJiRows([]);
    prevFilteredAddrsRef.current = "";
    setSearchTab("ri");
    setStep("volume");
    onClearMapFilter?.();
  };

  // 외부에서 resetKey가 바뀌면 1단계로 리셋
  const prevResetKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== prevResetKey.current) {
      prevResetKey.current = resetKey;
      if (step === "results") handleBack();
    }
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const volumeActiveCount = (
    (filters.cap_subst.size > 0 ? 1 : 0) +
    (filters.cap_mtr.size > 0 ? 1 : 0) +
    (filters.cap_dl.size > 0 ? 1 : 0)
  );

  const regionActiveCount = (
    (region.addr_do ? 1 : 0) +
    (region.addr_si ? 1 : 0) +
    (region.addr_gu ? 1 : 0) +
    (region.addr_dong ? 1 : 0)
  );

  // ── 렌더링 ──

  return (
    <div className="overflow-y-auto h-full">
      <div className="px-3 py-3 space-y-3">

        {step === "volume" ? (
          <>
            {/* ── 1단계: 여유용량 조건 설정 ── */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">조건 설정</span>
              {volumeActiveCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                    {volumeActiveCount}
                  </span>
                  <button onClick={reset} className="text-[10px] text-gray-400 hover:text-red-500">
                    초기화
                  </button>
                </div>
              )}
            </div>

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

            <button
              type="button"
              onClick={handleSearch}
              className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
            >
              다음: 지역 선택 → ({volumeFiltered.length.toLocaleString()}개 마을)
            </button>
          </>
        ) : (
          <>
            {/* ── 2단계: 결과 내 지역 필터링 ── */}
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="text-[10px] text-blue-600 hover:bg-blue-100 font-bold shrink-0 active:opacity-70 px-2 py-1 rounded-md border border-blue-200 bg-blue-50 transition-colors">
                ← 조건 변경
              </button>
              <div className="text-[11px] text-gray-500">
                <span className="font-semibold text-gray-700">{conditionResults.length.toLocaleString()}</span>
                <span className="text-gray-400"> / {step1Rows.length.toLocaleString()}개</span>
              </div>
              {regionActiveCount > 0 && (
                <button
                  onClick={() => setRegion(EMPTY_REGION)}
                  className="text-[10px] text-gray-400 hover:text-red-500 shrink-0"
                >
                  초기화
                </button>
              )}
            </div>

            {/* 지역 필터 — 드롭다운 4개 한 줄 */}
            <RegionFilter rows={step1Rows} value={region} onChange={setRegion} />
          </>
        )}
      </div>

      {/* 결과 리스트 — 2단계에서만 표시 */}
      {step === "results" && (
        <div className="border-t border-gray-200">
          {/* 리/지번 탭 */}
          <div className="flex border-b border-gray-100 px-2">
            {(["ri", "ji"] as const).map((t) => {
              const count = t === "ri" ? conditionResults.length : sortedJi.length;
              const label = t === "ri" ? "리 단위" : "지번 단위";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSearchTab(t)}
                  className={`px-3 py-1.5 text-[11px] font-semibold border-b-2 transition-colors flex items-center gap-1 ${
                    searchTab === t
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {label}
                  <span className={`text-[10px] px-1 rounded-full ${
                    count > 0
                      ? searchTab === t ? "bg-blue-500 text-white" : "bg-blue-100 text-blue-700"
                      : "bg-gray-200 text-gray-500"
                  }`}>{jiLoading && t === "ji" ? "…" : count}</span>
                </button>
              );
            })}
          </div>
          {/* 정렬 */}
          <div className="flex gap-1 px-2 py-1.5 border-b border-gray-100">
            {searchTab === "ri"
              ? ([
                  ["remaining_desc", "잔여용량"],
                  ["count_desc", "건수"],
                  ["name_asc", "가나다"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setRiSortKey(key)}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                      riSortKey === key
                        ? "bg-gray-700 border-gray-700 text-white font-medium"
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))
              : ([
                  ["remaining_desc", "여유용량"],
                  ["jibun_asc", "지번순"],
                  ["name_asc", "가나다"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setJiSortKey(key)}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                      jiSortKey === key
                        ? "bg-gray-700 border-gray-700 text-white font-medium"
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))
            }
          </div>
          {/* 지번 limit 안내 */}
          {searchTab === "ji" && sortedJi.length >= 200 && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[11px] text-amber-800">
              최대 200건까지 표시됩니다. 지역 필터로 범위를 좁혀 보세요.
            </div>
          )}
          {jiLoading && searchTab === "ji" ? (
            <div className="px-4 py-8 text-center text-xs text-gray-500">지번 데이터 조회 중...</div>
          ) : (
            <SearchResultList
              mode={searchTab}
              ri={conditionResults}
              ji={sortedJi}
              selectedAddr={selectedAddr}
              onPick={(pick) => onSearchPick?.(pick)}
              onJibunPin={onJibunPin}
            />
          )}
        </div>
      )}
    </div>
  );
}
