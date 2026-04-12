"use client";

import { useState, useMemo, useEffect } from "react";
import ChipToggle from "./ChipToggle";
import type { SearchPick } from "./SearchResultList";
import type { CompareRefRow } from "@/app/api/compare/route";

interface Props {
  onSearchPick?: (pick: SearchPick) => void;
  selectedAddr?: string | null;
  isAdmin?: boolean;
}

type FilterValue = "any" | "same" | "gained" | "lost";
type SortKey = "changed_desc" | "name_asc";

/** 변화 유형 토글 — 한 줄: 라벨 + 버튼 */
function ChangeToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const items: { v: FilterValue; text: string; color: "default" | "green" | "red" }[] = [
    { v: "any", text: "전체", color: "default" },
    { v: "gained", text: "없음→있음", color: "green" },
    { v: "lost", text: "있음→없음", color: "red" },
  ];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-gray-600 w-12 shrink-0">{label}</span>
      <div className="flex gap-1 flex-1">
        {items.map(({ v, text, color }) => {
          const active = value === v;
          const activeCls =
            color === "green"
              ? "bg-green-500 border-green-500 text-white"
              : color === "red"
                ? "bg-red-500 border-red-500 text-white"
                : "bg-gray-700 border-gray-700 text-white";
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`flex-1 py-1.5 text-[10px] rounded-md border transition-colors font-medium whitespace-nowrap ${
                active ? activeCls : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 시설별 변화 요약 */
interface FacilityChange {
  gained: number;  // 없음→있음
  lost: number;    // 있음→없음
}

/** 마을 단위 분석 */
interface VillageStats {
  geocode_address: string;
  lat: number;
  lng: number;
  addr_do: string;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
  direction: "improved" | "worsened" | "mixed" | "unchanged";
  gained: number;
  lost: number;
  totalRows: number;
  subst: FacilityChange;
  mtr: FacilityChange;
  dl: FacilityChange;
  rows: CompareRefRow[];
}

function analyzeVillage(rows: CompareRefRow[]): VillageStats {
  const first = rows[0];
  const subst: FacilityChange = { gained: 0, lost: 0 };
  const mtr: FacilityChange = { gained: 0, lost: 0 };
  const dl: FacilityChange = { gained: 0, lost: 0 };

  for (const r of rows) {
    if (!r.prev_subst_ok && r.curr_subst_ok) subst.gained++;
    if (r.prev_subst_ok && !r.curr_subst_ok) subst.lost++;
    if (!r.prev_mtr_ok && r.curr_mtr_ok) mtr.gained++;
    if (r.prev_mtr_ok && !r.curr_mtr_ok) mtr.lost++;
    if (!r.prev_dl_ok && r.curr_dl_ok) dl.gained++;
    if (r.prev_dl_ok && !r.curr_dl_ok) dl.lost++;
  }

  const gained = subst.gained + mtr.gained + dl.gained;
  const lost = subst.lost + mtr.lost + dl.lost;

  let direction: VillageStats["direction"] = "unchanged";
  if (gained > 0 && lost === 0) direction = "improved";
  else if (lost > 0 && gained === 0) direction = "worsened";
  else if (gained > 0 && lost > 0) direction = "mixed";

  return {
    geocode_address: first.geocode_address,
    lat: first.lat,
    lng: first.lng,
    addr_do: first.addr_do,
    addr_si: first.addr_si,
    addr_gu: first.addr_gu,
    addr_dong: first.addr_dong,
    addr_li: first.addr_li,
    direction,
    gained,
    lost,
    totalRows: rows.length,
    subst,
    mtr,
    dl,
    rows,
  };
}

function groupToVillages(rows: CompareRefRow[]): VillageStats[] {
  const map = new Map<string, CompareRefRow[]>();
  for (const r of rows) {
    const arr = map.get(r.geocode_address) ?? [];
    arr.push(r);
    map.set(r.geocode_address, arr);
  }
  return Array.from(map.values()).map(analyzeVillage);
}

export default function CompareFilterPanel({ onSearchPick, selectedAddr, isAdmin }: Props) {
  const [step, setStep] = useState<"filter" | "results">("filter");
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  // 필터 상태
  const [substFilter, setSubstFilter] = useState<FilterValue>("any");
  const [mtrFilter, setMtrFilter] = useState<FilterValue>("any");
  const [dlFilter, setDlFilter] = useState<FilterValue>("any");
  const [changedOnly, setChangedOnly] = useState(false);

  // 결과 상태
  const [allVillages, setAllVillages] = useState<VillageStats[]>([]);
  const [step1Villages, setStep1Villages] = useState<VillageStats[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("changed_desc");
  const [detailRegionOpen, setDetailRegionOpen] = useState(false);
  const [expandedAddr, setExpandedAddr] = useState<string | null>(null);

  // 지역 필터
  const [addrDo, setAddrDo] = useState<Set<string>>(new Set());
  const [addrSi, setAddrSi] = useState<Set<string>>(new Set());
  const [addrGu, setAddrGu] = useState<Set<string>>(new Set());
  const [addrDong, setAddrDong] = useState<Set<string>>(new Set());
  const [addrLi, setAddrLi] = useState<Set<string>>(new Set());

  // 기준일 + 날짜 목록 로드
  useEffect(() => {
    fetch("/api/compare/dates")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          if (d.snapshotDate) setSnapshotDate(d.snapshotDate);
          if (d.dates && d.dates.length > 0) {
            setAvailableDates(d.dates);
            setSelectedDate(d.dates[0]);
          }
        }
      })
      .catch(() => {});
  }, []);

  // ── 검색 (API 호출) ──
  const handleSearch = async () => {
    setLoading(true);
    try {
      const dateToUse = selectedDate || snapshotDate || new Date().toISOString().slice(0, 10);
      const params = new URLSearchParams({ date: dateToUse, subst: substFilter, mtr: mtrFilter, dl: dlFilter });
      const res = await fetch(`/api/compare?${params}`);
      const data = await res.json();
      if (data.ok) {
        let villages = groupToVillages(data.rows);
        if (changedOnly) villages = villages.filter((v) => v.direction !== "unchanged");
        setAllVillages(villages);
        setStep1Villages([...villages]);
        clearRegionFilters();
        setStep("results");
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleBack = () => {
    clearRegionFilters();
    setStep1Villages([]);
    setStep("filter");
  };

  const reset = () => {
    setSubstFilter("any");
    setMtrFilter("any");
    setDlFilter("any");
    setChangedOnly(false);
    setSortKey("changed_desc");
    setAllVillages([]);
    setStep1Villages([]);
    clearRegionFilters();
    setStep("filter");
  };

  const clearRegionFilters = () => {
    setAddrDo(new Set());
    setAddrSi(new Set());
    setAddrGu(new Set());
    setAddrDong(new Set());
    setAddrLi(new Set());
  };

  const handleReset = async () => {
    if (!confirm("기준 스냅샷을 현재 상태로 리셋하시겠습니까?\n모든 비교 기록이 초기화됩니다.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/compare/reset", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSnapshotDate(new Date().toISOString().slice(0, 10));
        reset();
      }
    } catch { /* ignore */ }
    finally { setResetting(false); }
  };

  // ── 2단계: 지역 옵션 (step1Villages 기준) ──
  const regionSource = step === "results" ? step1Villages : [];

  const addrDoOptions = useMemo(() => {
    const set = new Set<string>();
    regionSource.forEach((r) => r.addr_do && set.add(r.addr_do));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [regionSource]);

  const addrSiOptions = useMemo(() => {
    const set = new Set<string>();
    regionSource.forEach((r) => {
      if (addrDo.size > 0 && !addrDo.has(r.addr_do)) return;
      if (r.addr_si) set.add(r.addr_si);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [regionSource, addrDo]);

  const addrGuOptions = useMemo(() => {
    const set = new Set<string>();
    regionSource.forEach((r) => {
      if (addrDo.size > 0 && !addrDo.has(r.addr_do)) return;
      if (addrSi.size > 0 && (!r.addr_si || !addrSi.has(r.addr_si))) return;
      if (r.addr_gu) set.add(r.addr_gu);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [regionSource, addrDo, addrSi]);

  const addrDongOptions = useMemo(() => {
    const set = new Set<string>();
    regionSource.forEach((r) => {
      if (addrDo.size > 0 && !addrDo.has(r.addr_do)) return;
      if (addrSi.size > 0 && (!r.addr_si || !addrSi.has(r.addr_si))) return;
      if (addrGu.size > 0 && (!r.addr_gu || !addrGu.has(r.addr_gu))) return;
      if (r.addr_dong) set.add(r.addr_dong);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [regionSource, addrDo, addrSi, addrGu]);

  const addrLiOptions = useMemo(() => {
    const set = new Set<string>();
    regionSource.forEach((r) => {
      if (addrDo.size > 0 && !addrDo.has(r.addr_do)) return;
      if (addrSi.size > 0 && (!r.addr_si || !addrSi.has(r.addr_si))) return;
      if (addrGu.size > 0 && (!r.addr_gu || !addrGu.has(r.addr_gu))) return;
      if (addrDong.size > 0 && (!r.addr_dong || !addrDong.has(r.addr_dong))) return;
      if (r.addr_li) set.add(r.addr_li);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [regionSource, addrDo, addrSi, addrGu, addrDong]);

  // 카스케이딩
  useEffect(() => {
    if (step !== "results") return;
    const prune = (sel: Set<string>, valid: string[]): Set<string> | null => {
      if (sel.size === 0) return null;
      const vs = new Set(valid);
      const next = new Set<string>();
      let changed = false;
      sel.forEach((v) => { if (vs.has(v)) next.add(v); else changed = true; });
      return changed ? next : null;
    };
    const a = prune(addrDo, addrDoOptions); if (a) setAddrDo(a);
    const b = prune(addrSi, addrSiOptions); if (b) setAddrSi(b);
    const c = prune(addrGu, addrGuOptions); if (c) setAddrGu(c);
    const d = prune(addrDong, addrDongOptions); if (d) setAddrDong(d);
    const e = prune(addrLi, addrLiOptions); if (e) setAddrLi(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, addrDoOptions.length, addrSiOptions.length, addrGuOptions.length, addrDongOptions.length, addrLiOptions.length]);

  // ── 필터링된 결과 ──
  const filteredVillages = useMemo(() => {
    if (step !== "results") return [];
    return step1Villages.filter((v) => {
      if (addrDo.size > 0 && !addrDo.has(v.addr_do)) return false;
      if (addrSi.size > 0 && (!v.addr_si || !addrSi.has(v.addr_si))) return false;
      if (addrGu.size > 0 && (!v.addr_gu || !addrGu.has(v.addr_gu))) return false;
      if (addrDong.size > 0 && (!v.addr_dong || !addrDong.has(v.addr_dong))) return false;
      if (addrLi.size > 0 && (!v.addr_li || !addrLi.has(v.addr_li))) return false;
      return true;
    });
  }, [step, step1Villages, addrDo, addrSi, addrGu, addrDong, addrLi]);

  const sortedVillages = useMemo(() => {
    const arr = [...filteredVillages];
    switch (sortKey) {
      case "changed_desc":
        arr.sort((a, b) => {
          const order = { improved: 0, mixed: 1, worsened: 2, unchanged: 3 };
          const od = order[a.direction] - order[b.direction];
          if (od !== 0) return od;
          return (b.gained + b.lost) - (a.gained + a.lost);
        });
        break;
      case "name_asc":
        arr.sort((a, b) => a.geocode_address.localeCompare(b.geocode_address, "ko"));
        break;
    }
    return arr;
  }, [filteredVillages, sortKey]);

  const regionActiveCount = (addrDo.size > 0 ? 1 : 0) + (addrSi.size > 0 ? 1 : 0) + (addrGu.size > 0 ? 1 : 0) + (addrDong.size > 0 ? 1 : 0) + (addrLi.size > 0 ? 1 : 0);

  const activeFilterCount = (substFilter !== "any" ? 1 : 0) + (mtrFilter !== "any" ? 1 : 0) + (dlFilter !== "any" ? 1 : 0) + (changedOnly ? 1 : 0);

  // ── 렌더링 ──
  return (
    <div className="overflow-y-auto h-full">
      <div className="px-3 py-3 space-y-3">
        {/* 스텝 인디케이터 */}
        <div className="flex items-center gap-1 text-[10px]">
          <span className={`px-2 py-0.5 rounded-full font-bold ${step === "filter" ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"}`}>① 조건</span>
          <span className="text-gray-300">→</span>
          <span className={`px-2 py-0.5 rounded-full font-bold ${step === "results" ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"}`}>② 지역</span>
        </div>

        {step === "filter" ? (
          <>
            {/* ── 1단계: 비교 조건 설정 ── */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">비교 설정</span>
              {activeFilterCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                    {activeFilterCount}
                  </span>
                  <button onClick={reset} className="text-[10px] text-gray-400 hover:text-red-500">초기화</button>
                </div>
              )}
            </div>

            {/* 기준일 + 비교 날짜 */}
            <div className="text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1.5 space-y-1">
              <div>
                <span>📅 기준일: <b className="text-gray-800">{snapshotDate ?? "로딩 중..."}</b></span>
                {isAdmin && (
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="ml-2 text-[10px] text-gray-400 hover:text-red-500 disabled:opacity-50"
                  >
                    {resetting ? "리셋 중..." : "리셋"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span>📆 비교 시점:</span>
                {availableDates.length > 0 ? (
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="border border-gray-300 rounded px-1.5 py-0.5 text-[11px] text-gray-900 bg-white"
                  >
                    {availableDates.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-gray-400">기록 없음 (수집 후 생성)</span>
                )}
                <span className="text-gray-400">~ 현재</span>
              </div>
            </div>

            {/* 변화 유형 필터 */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                <span>📊</span> 변화 유형
              </div>
              <button
                type="button"
                onClick={() => setChangedOnly(!changedOnly)}
                className={`w-full rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  changedOnly
                    ? "bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300"
                    : "bg-white hover:bg-orange-50 text-gray-600 border border-gray-200 hover:border-orange-200"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${changedOnly ? "bg-orange-500" : "bg-gray-400"}`} />
                {changedOnly ? "변화 있는 곳만 보는 중" : "변화 있는 곳만 보기"}
                {changedOnly && <span className="text-[10px] text-orange-400 ml-auto">✕</span>}
              </button>
              <ChangeToggle label="변전소" value={substFilter} onChange={setSubstFilter} />
              <ChangeToggle label="주변압기" value={mtrFilter} onChange={setMtrFilter} />
              <ChangeToggle label="배전선로" value={dlFilter} onChange={setDlFilter} />
            </div>

            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "분석 중..." : "다음: 지역 선택 →"}
            </button>

            {!loading && allVillages.length === 0 && (
              <div className="text-center py-4">
                <div className="text-xs text-gray-500 space-y-1">
                  <p>기준일 대비 현재의 <b>여유 상태 변화</b>를 분석합니다.</p>
                  <p className="text-[10px] text-gray-400">
                    <span className="text-green-600">없음→있음</span> = 여유 새로 생김 · <span className="text-red-600">있음→없음</span> = 여유 사라짐
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── 2단계: 결과 내 지역 필터링 ── */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 px-3 py-2 text-[11px] font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-md border border-orange-200 transition-colors shrink-0"
              >
                <span>←</span> 조건 변경
              </button>
              <div className="text-[11px] text-gray-500 truncate">
                <span className="font-semibold text-gray-700">{sortedVillages.length.toLocaleString()}</span>
                <span className="text-gray-400"> / {step1Villages.length.toLocaleString()}개</span>
              </div>
              {regionActiveCount > 0 && (
                <button onClick={clearRegionFilters} className="text-[10px] text-gray-400 hover:text-red-500 shrink-0">초기화</button>
              )}
            </div>

            {/* 요약 통계 */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="bg-green-50 rounded-lg py-1.5">
                <div className="text-sm font-bold text-green-700">{sortedVillages.filter((v) => v.direction === "improved").length}</div>
                <div className="text-[9px] text-green-600">없음→있음</div>
              </div>
              <div className="bg-red-50 rounded-lg py-1.5">
                <div className="text-sm font-bold text-red-700">{sortedVillages.filter((v) => v.direction === "worsened").length}</div>
                <div className="text-[9px] text-red-600">있음→없음</div>
              </div>
              <div className="bg-amber-50 rounded-lg py-1.5">
                <div className="text-sm font-bold text-amber-700">{sortedVillages.filter((v) => v.direction === "mixed").length}</div>
                <div className="text-[9px] text-amber-600">혼합</div>
              </div>
            </div>

            {/* 지역 필터 */}
            <div className="space-y-2">
              <ChipToggle label="시/도" options={addrDoOptions} selected={addrDo} onChange={setAddrDo} />
              <ChipToggle label="시" options={addrSiOptions} selected={addrSi} onChange={setAddrSi} searchable />
              <button
                type="button"
                onClick={() => setDetailRegionOpen(!detailRegionOpen)}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <span className={`transition-transform text-[10px] ${detailRegionOpen ? "rotate-90" : ""}`}>▶</span>
                상세지역설정
                {(addrGu.size > 0 || addrDong.size > 0 || addrLi.size > 0) && (
                  <span className="bg-blue-500 text-white text-[9px] px-1 rounded-full ml-1">
                    {addrGu.size + addrDong.size + addrLi.size}
                  </span>
                )}
              </button>
              {detailRegionOpen && (
                <div className="space-y-2 pl-2 border-l-2 border-blue-200">
                  <ChipToggle label="구/군" options={addrGuOptions} selected={addrGu} onChange={setAddrGu} searchable />
                  <ChipToggle label="동/면" options={addrDongOptions} selected={addrDong} onChange={setAddrDong} searchable />
                  <ChipToggle label="리" options={addrLiOptions} selected={addrLi} onChange={setAddrLi} searchable maxHeight="160px" />
                </div>
              )}
            </div>

            {/* 정렬 */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">정렬</label>
              <div className="flex flex-wrap gap-1">
                {([
                  ["changed_desc", "변화 많은 순"],
                  ["name_asc", "가나다순"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortKey(key)}
                    className={`px-2.5 py-1.5 text-[11px] rounded-full border transition-colors ${
                      sortKey === key
                        ? "bg-gray-700 border-gray-700 text-white font-medium"
                        : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 결과 마을 목록 */}
      {step === "results" && (
        <div className="border-t border-gray-200">
          {sortedVillages.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">해당 조건의 변경이 없습니다.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sortedVillages.map((v) => {
                const isSelected = selectedAddr === v.geocode_address;
                const dirConfig = {
                  improved: { badge: "없음→있음", cls: "bg-green-100 text-green-700" },
                  worsened: { badge: "있음→없음", cls: "bg-red-100 text-red-700" },
                  mixed: { badge: "혼합", cls: "bg-amber-100 text-amber-700" },
                  unchanged: { badge: "동일", cls: "bg-gray-100 text-gray-600" },
                }[v.direction];

                const isExpanded = expandedAddr === v.geocode_address;

                return (
                  <li key={v.geocode_address}>
                    <button
                      type="button"
                      onClick={() => {
                        onSearchPick?.({
                          kind: "ri",
                          row: {
                            addr_do: v.addr_do,
                            addr_si: v.addr_si,
                            addr_gu: v.addr_gu,
                            addr_dong: v.addr_dong,
                            addr_li: v.addr_li,
                            geocode_address: v.geocode_address,
                            cnt: v.totalRows,
                            lat: v.lat,
                            lng: v.lng,
                          },
                        });
                        setExpandedAddr(isExpanded ? null : v.geocode_address);
                      }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${
                        isSelected
                          ? "bg-orange-50 border-l-2 border-orange-500"
                          : "hover:bg-orange-50 active:bg-orange-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-gray-900 truncate">
                            {v.geocode_address}
                          </div>
                          <div className="text-[10px] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${dirConfig.cls}`}>
                              {dirConfig.badge}
                            </span>
                            <FacilityDelta label="변전소" change={v.subst} />
                            <FacilityDelta label="주변압기" change={v.mtr} />
                            <FacilityDelta label="배전선로" change={v.dl} />
                          </div>
                        </div>
                        <div className={`text-orange-400 text-xs flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</div>
                      </div>
                    </button>
                    {/* 지번별 상세 */}
                    {isExpanded && (
                      <div className="px-4 pb-2 bg-gray-50 border-l-2 border-orange-300">
                        <div className="text-[10px] text-gray-500 py-1.5 font-bold">지번별 변화 상세</div>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {v.rows.map((r, i) => (
                            <JibunChangeRow key={i} row={r} />
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 시설별 변화 표시 — 변화 없으면 렌더링 안 함 */
function FacilityDelta({ label, change }: { label: string; change: FacilityChange }) {
  if (change.gained === 0 && change.lost === 0) return null;
  return (
    <span className="text-[10px] text-gray-600">
      <span className="text-gray-400">{label}</span>
      {change.gained > 0 && <span className="text-green-600 ml-0.5">+{change.gained}</span>}
      {change.lost > 0 && <span className="text-red-600 ml-0.5">-{change.lost}</span>}
    </span>
  );
}

/** 지번별 변화 행 */
function JibunChangeRow({ row }: { row: CompareRefRow }) {
  const changes: { label: string; prev: boolean; curr: boolean }[] = [];
  if (row.prev_subst_ok !== row.curr_subst_ok) changes.push({ label: "변전소", prev: row.prev_subst_ok, curr: row.curr_subst_ok });
  if (row.prev_mtr_ok !== row.curr_mtr_ok) changes.push({ label: "주변압기", prev: row.prev_mtr_ok, curr: row.curr_mtr_ok });
  if (row.prev_dl_ok !== row.curr_dl_ok) changes.push({ label: "배전선로", prev: row.prev_dl_ok, curr: row.curr_dl_ok });

  if (changes.length === 0) return null;

  return (
    <div className="bg-white rounded px-2.5 py-1.5 border border-gray-200">
      <div className="text-[10px] font-medium text-gray-800 truncate">
        {row.addr_jibun || "-"} <span className="text-gray-400 font-normal">{row.dl_nm || row.subst_nm || ""}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
        {changes.map((c) => (
          <span key={c.label} className="text-[9px]">
            <span className="text-gray-400">{c.label}</span>
            <span className={c.prev ? "text-green-600 ml-0.5" : "text-red-600 ml-0.5"}>{c.prev ? "여유" : "없음"}</span>
            <span className="text-gray-400 mx-0.5">→</span>
            <span className={c.curr ? "text-green-600" : "text-red-600"}>{c.curr ? "여유" : "없음"}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
