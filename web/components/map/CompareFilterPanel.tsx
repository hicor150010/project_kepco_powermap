"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import RegionFilter, { applyRegionFilter, EMPTY_REGION, type RegionSelection } from "./RegionFilter";
import type { SearchPick } from "./SearchResultList";
import type { CompareRefRow } from "@/app/api/compare/route";

interface Props {
  onSearchPick?: (pick: SearchPick) => void;
  selectedAddr?: string | null;
  onMapFilter?: (addrs: Set<string>) => void;
  onClearMapFilter?: () => void;
  resetKey?: number;
}

type FilterValue = "any" | "same" | "gained" | "lost";
type SortKey = "changed_desc" | "name_asc";

/** 한국식 날짜 표시 date input — iOS에서 미국식으로 보이는 문제 해결 */
function KoreanDateInput({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  // YYYY-MM-DD → YYYY.MM.DD
  const display = value ? value.replace(/-/g, ".") : "";
  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className="border border-gray-300 rounded px-1.5 py-1 text-[11px] text-gray-900 bg-white truncate pointer-events-none">
        {display || <span className="text-gray-400">날짜 선택</span>}
      </div>
    </div>
  );
}

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

export default function CompareFilterPanel({ onSearchPick, selectedAddr, onMapFilter, onClearMapFilter, resetKey = 0 }: Props) {
  const [step, setStep] = useState<"filter" | "results">("filter");
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [dateA, setDateA] = useState<string>("");   // 시점 A (과거)
  const [dateB, setDateB] = useState<string>("");   // 시점 B (기본=오늘=현재)
  const [loading, setLoading] = useState(false);

  // 필터 상태
  const [substFilter, setSubstFilter] = useState<FilterValue>("any");
  const [mtrFilter, setMtrFilter] = useState<FilterValue>("any");
  const [dlFilter, setDlFilter] = useState<FilterValue>("any");
  const [changedOnly, setChangedOnly] = useState(false);

  // 결과 상태
  const [allVillages, setAllVillages] = useState<VillageStats[]>([]);
  const [step1Villages, setStep1Villages] = useState<VillageStats[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("changed_desc");
  const [expandedAddr, setExpandedAddr] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionSelection>(EMPTY_REGION);
  const [clickedJibun, setClickedJibun] = useState<string | null>(null);

  // ref 기준일 로드 (선택 가능한 최소 날짜)
  useEffect(() => {
    fetch("/api/compare/dates")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.snapshotDate) {
          setSnapshotDate(d.snapshotDate);
          setDateA(d.snapshotDate);
        }
      })
      .catch(() => {});
  }, []);

  // ── 검색 (API 호출) ──
  const handleSearch = async () => {
    if (!dateA) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_a: dateA,
        subst: substFilter,
        mtr: mtrFilter,
        dl: dlFilter,
      });
      // dateB가 오늘이면 생략 (현재값 사용), 과거 날짜면 전달
      if (dateB && dateB !== today) params.set("date_b", dateB);
      const res = await fetch(`/api/compare?${params}`);
      const data = await res.json();
      if (data.ok) {
        let villages = groupToVillages(data.rows);
        if (changedOnly) villages = villages.filter((v) => v.direction !== "unchanged");
        setAllVillages(villages);
        setStep1Villages([...villages]);
        setRegion(EMPTY_REGION);
        setStep("results");
        onMapFilter?.(new Set(villages.map((v) => v.geocode_address)));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleBack = () => {
    setRegion(EMPTY_REGION);
    setStep1Villages([]);
    setClickedJibun(null);
    setStep("filter");
    onClearMapFilter?.();
  };

  const reset = () => {
    setDateA(snapshotDate ?? "");
    setDateB("");
    setSubstFilter("any");
    setMtrFilter("any");
    setDlFilter("any");
    setChangedOnly(false);
    setSortKey("changed_desc");
    setAllVillages([]);
    setStep1Villages([]);
    setRegion(EMPTY_REGION);
    setClickedJibun(null);
    setStep("filter");
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

  // ── 필터링된 결과 ──
  const filteredVillages = useMemo(() => {
    if (step !== "results") return [];
    return applyRegionFilter(step1Villages, region);
  }, [step, step1Villages, region]);

  // 2단계 지역 필터 변경 시 지도 마커도 갱신
  const onMapFilterRef = useRef(onMapFilter);
  onMapFilterRef.current = onMapFilter;
  useEffect(() => {
    if (step !== "results") return;
    onMapFilterRef.current?.(new Set(filteredVillages.map((v) => v.geocode_address)));
  }, [step, filteredVillages]);

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

  const regionActiveCount = (region.addr_do ? 1 : 0) + (region.addr_si ? 1 : 0) + (region.addr_gu ? 1 : 0) + (region.addr_dong ? 1 : 0);

  const activeFilterCount = (substFilter !== "any" ? 1 : 0) + (mtrFilter !== "any" ? 1 : 0) + (dlFilter !== "any" ? 1 : 0) + (changedOnly ? 1 : 0);

  // ── 렌더링 ──
  return (
    <div className="overflow-y-auto h-full">
      <div className="px-3 py-2 space-y-2">
        {step === "filter" ? (
          <>
            {/* ── 1단계: 비교 조건 설정 ── */}
            <div className="flex items-center justify-between -mt-0.5">
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

            {/* 시점 선택: A → B 한 줄 */}
            <div className="bg-gray-50 rounded px-2 py-2 space-y-2">
              <div className="flex items-center gap-1.5">
                <KoreanDateInput
                  value={dateA}
                  min={snapshotDate ?? undefined}
                  max={today}
                  onChange={setDateA}
                />
                <span className="text-sm font-bold text-gray-500 shrink-0">→</span>
                <KoreanDateInput
                  value={dateB || today}
                  min={snapshotDate ?? undefined}
                  max={today}
                  onChange={setDateB}
                />
              </div>
              {(!dateB || dateB === today) && (
                <div className="text-[10px] text-gray-400 text-right">시점 B = 현재</div>
              )}

              {/* 변화 유형 필터 */}
              <div className="space-y-1.5 pt-1 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-700">변화 유형</span>
                  <button
                    type="button"
                    onClick={() => setChangedOnly(!changedOnly)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      changedOnly
                        ? "bg-orange-500 border-orange-500 text-white"
                        : "bg-white border-gray-300 text-gray-500 hover:border-orange-300"
                    }`}
                  >
                    변화만
                  </button>
                </div>
                <ChangeToggle label="변전소" value={substFilter} onChange={setSubstFilter} />
                <ChangeToggle label="주변압기" value={mtrFilter} onChange={setMtrFilter} />
                <ChangeToggle label="배전선로" value={dlFilter} onChange={setDlFilter} />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "분석 중..." : "다음: 지역 선택 →"}
            </button>

            {!loading && allVillages.length === 0 && (
              <div className="text-center py-3">
                <div className="text-xs text-gray-500 space-y-1">
                  <p>두 시점의 <b>여유 상태 변화</b>를 비교합니다.</p>
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
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="text-[10px] text-orange-600 hover:bg-orange-100 font-bold shrink-0 active:opacity-70 px-2 py-1 rounded-md border border-orange-200 bg-orange-50 transition-colors">
                ← 조건 변경
              </button>
              <div className="text-[11px] text-gray-500">
                <span className="font-semibold text-gray-700">{sortedVillages.length.toLocaleString()}</span>
                <span className="text-gray-400"> / {step1Villages.length.toLocaleString()}개</span>
              </div>
              {regionActiveCount > 0 && (
                <button onClick={() => setRegion(EMPTY_REGION)} className="text-[10px] text-gray-400 hover:text-red-500 shrink-0">초기화</button>
              )}
            </div>

            {/* 요약 통계 — 인라인 배지 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                없음→있음 {sortedVillages.filter((v) => v.direction === "improved").length}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                있음→없음 {sortedVillages.filter((v) => v.direction === "worsened").length}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                혼합 {sortedVillages.filter((v) => v.direction === "mixed").length}
              </span>
            </div>

            {/* 지역 필터 — 드롭다운 4개 한 줄 */}
            <RegionFilter rows={step1Villages} value={region} onChange={setRegion} />

            {/* 정렬 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-500 shrink-0">정렬</span>
              {([
                ["changed_desc", "변화 많은 순"],
                ["name_asc", "가나다순"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`px-2 py-1 text-[10px] rounded-full border transition-colors ${
                    sortKey === key
                      ? "bg-gray-700 border-gray-700 text-white font-medium"
                      : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
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
                    <div
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                        isSelected ? "bg-orange-50 border-l-2 border-orange-500"
                          : isExpanded ? "bg-orange-50/50" : "hover:bg-orange-50"
                      }`}
                    >
                      {/* 텍스트 클릭 = 지도 이동 (모바일: 사이드바 닫힘) */}
                      <div
                        className="min-w-0 flex-1 cursor-pointer active:opacity-70"
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
                        }}
                      >
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {v.geocode_address}
                        </div>
                        <div className="text-[11px] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${dirConfig.cls}`}>
                            {dirConfig.badge}
                          </span>
                          <FacilityDelta label="변전소" change={v.subst} />
                          <FacilityDelta label="주변압기" change={v.mtr} />
                          <FacilityDelta label="배전선로" change={v.dl} />
                        </div>
                      </div>
                      {/* ▶ 클릭 = 펼침/접기 (사이드바 유지) */}
                      <button
                        type="button"
                        onClick={() => setExpandedAddr(isExpanded ? null : v.geocode_address)}
                        className={`text-orange-500 text-xs flex-shrink-0 transition-transform p-2 -m-2 ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      >
                        ▶
                      </button>
                    </div>
                    {/* 지번별 상세 */}
                    {isExpanded && (
                      <div className="px-4 pb-2 bg-gray-50 border-l-2 border-orange-300">
                        <div className="text-[11px] text-gray-500 py-1.5 font-bold">지번별 변화 상세</div>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {v.rows.map((r, i) => {
                            const jibunKey = `${v.geocode_address}::${r.addr_jibun}`;
                            return (
                              <JibunChangeRow key={i} row={r} active={clickedJibun === jibunKey} onClick={() => {
                                setClickedJibun(jibunKey);
                                onSearchPick?.({
                                  kind: "ji_compare",
                                  row: {
                                    geocode_address: v.geocode_address,
                                    lat: v.lat,
                                    lng: v.lng,
                                  },
                                  jibun: r.addr_jibun ?? "",
                                });
                              }} />
                            );
                          })}
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
    <span className="text-[11px] text-gray-600">
      <span className="text-gray-400">{label}</span>
      {change.gained > 0 && <span className="text-green-600 ml-0.5">+{change.gained}</span>}
      {change.lost > 0 && <span className="text-red-600 ml-0.5">-{change.lost}</span>}
    </span>
  );
}

/** 지번별 변화 행 */
function JibunChangeRow({ row, onClick, active }: { row: CompareRefRow; onClick?: () => void; active?: boolean }) {
  const changes: { label: string; prev: boolean; curr: boolean }[] = [];
  if (row.prev_subst_ok !== row.curr_subst_ok) changes.push({ label: "변전소", prev: row.prev_subst_ok, curr: row.curr_subst_ok });
  if (row.prev_mtr_ok !== row.curr_mtr_ok) changes.push({ label: "주변압기", prev: row.prev_mtr_ok, curr: row.curr_mtr_ok });
  if (row.prev_dl_ok !== row.curr_dl_ok) changes.push({ label: "배전선로", prev: row.prev_dl_ok, curr: row.curr_dl_ok });

  if (changes.length === 0) return null;

  return (
    <div
      className={`rounded px-2.5 py-1.5 border cursor-pointer transition-colors ${
        active
          ? "bg-orange-50 border-orange-400"
          : "bg-white border-gray-200 hover:border-orange-400 hover:bg-orange-50 active:bg-orange-100"
      }`}
      onClick={onClick}
    >
      <div className="text-[11px] font-medium text-gray-800 truncate">
        {row.addr_jibun || "-"} <span className="text-gray-400 font-normal">{row.dl_nm || row.subst_nm || ""}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
        {changes.map((c) => (
          <span key={c.label} className="text-[10px]">
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
