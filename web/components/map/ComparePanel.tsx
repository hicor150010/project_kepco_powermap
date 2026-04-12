"use client";

import { useEffect, useState } from "react";
import type { CompareRefRow } from "@/app/api/compare/route";

interface Props {
  onResults: (rows: CompareRefRow[]) => void;
  onClose: () => void;
  onVillageClick?: (geocodeAddress: string, lat: number, lng: number) => void;
  isAdmin?: boolean;
}

type FilterValue = "any" | "same" | "gained" | "lost";

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "any", label: "전체" },
  { value: "same", label: "동일" },
  { value: "gained", label: "없음→있음 (NEW)" },
  { value: "lost", label: "있음→없음 (소멸)" },
];

// ── 마을 단위 분석 ──

interface VillageStats {
  address: string;
  addr_dong: string | null;
  addr_li: string | null;
  rows: CompareRefRow[];
  direction: "improved" | "worsened" | "mixed" | "unchanged";
  totalChanged: number;
}

function analyzeVillage(rows: CompareRefRow[]): VillageStats {
  const first = rows[0];

  let gained = 0;
  let lost = 0;
  for (const r of rows) {
    if (!r.prev_subst_ok && r.curr_subst_ok) gained++;
    if (r.prev_subst_ok && !r.curr_subst_ok) lost++;
    if (!r.prev_mtr_ok && r.curr_mtr_ok) gained++;
    if (r.prev_mtr_ok && !r.curr_mtr_ok) lost++;
    if (!r.prev_dl_ok && r.curr_dl_ok) gained++;
    if (r.prev_dl_ok && !r.curr_dl_ok) lost++;
  }

  let direction: VillageStats["direction"] = "unchanged";
  if (gained > 0 && lost === 0) direction = "improved";
  else if (lost > 0 && gained === 0) direction = "worsened";
  else if (gained > 0 && lost > 0) direction = "mixed";

  return {
    address: first.geocode_address,
    addr_dong: first.addr_dong,
    addr_li: first.addr_li,
    rows,
    direction,
    totalChanged: rows.length,
  };
}

// ── 메인 컴포넌트 ──

export default function ComparePanel({ onResults, onClose, onVillageClick, isAdmin }: Props) {
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [substFilter, setSubstFilter] = useState<FilterValue>("any");
  const [mtrFilter, setMtrFilter] = useState<FilterValue>("any");
  const [dlFilter, setDlFilter] = useState<FilterValue>("any");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [results, setResults] = useState<CompareRefRow[] | null>(null);

  // 기준일 로드
  useEffect(() => {
    fetch("/api/compare/dates")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.snapshotDate) {
          setSnapshotDate(d.snapshotDate);
        }
      })
      .catch(() => {});
  }, []);

  const handleCompare = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        subst: substFilter,
        mtr: mtrFilter,
        dl: dlFilter,
      });
      const res = await fetch(`/api/compare?${params}`);
      const data = await res.json();
      if (data.ok) {
        setResults(data.rows);
        onResults(data.rows);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("기준 스냅샷을 현재 상태로 리셋하시겠습니까?\n모든 비교 기록이 초기화됩니다.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/compare/reset", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSnapshotDate(new Date().toISOString().slice(0, 10));
        setResults(null);
        onResults([]);
      }
    } catch {
      /* ignore */
    } finally {
      setResetting(false);
    }
  };

  // 마을 단위 분석
  const villages: VillageStats[] = results
    ? Object.values(
        results.reduce(
          (acc, row) => {
            const key = row.geocode_address;
            if (!acc[key]) acc[key] = [];
            acc[key].push(row);
            return acc;
          },
          {} as Record<string, CompareRefRow[]>
        )
      ).map(analyzeVillage)
    : [];

  // 정렬: NEW(개선)를 위로
  villages.sort((a, b) => {
    const order = { improved: 0, mixed: 1, worsened: 2, unchanged: 3 };
    return order[a.direction] - order[b.direction];
  });

  const gainedCount = villages.filter((v) => v.direction === "improved").length;
  const lostCount = villages.filter((v) => v.direction === "worsened").length;
  const mixedCount = villages.filter((v) => v.direction === "mixed").length;

  return (
    <div className="absolute top-3 left-3 right-3 md:left-[340px] md:right-auto z-20 md:w-[380px] max-h-[calc(100dvh-80px)] bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-orange-500">
            <path d="M8 1v14M3 4l2-2 2 2M11 12l2 2 2-2M3 5v6M13 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          용량 변화 비교
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
          &times;
        </button>
      </div>

      {/* 기준일 + 현재 */}
      <div className="px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            기준일: <b className="text-gray-800">{snapshotDate ?? "로딩 중..."}</b>
            <span className="mx-1.5 text-gray-400">→</span>
            현재: <b className="text-gray-800">{new Date().toISOString().slice(0, 10)}</b>
          </span>
          {isAdmin && (
            <button
              onClick={handleReset}
              disabled={resetting}
              className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
            >
              {resetting ? "리셋 중..." : "기준일 리셋"}
            </button>
          )}
        </div>
      </div>

      {/* 필터 */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2">
        <div className="text-[11px] font-bold text-gray-600 mb-1">조건</div>
        <FilterRow label="변전소" value={substFilter} onChange={setSubstFilter} />
        <FilterRow label="주변압기" value={mtrFilter} onChange={setMtrFilter} />
        <FilterRow label="배전선로" value={dlFilter} onChange={setDlFilter} />

        <button
          onClick={handleCompare}
          disabled={loading}
          className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? "분석 중..." : "비교"}
        </button>
      </div>

      {/* 결과 */}
      {results !== null && (
        <>
          {/* 요약 */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg py-2">
                <div className="text-lg font-bold text-gray-800">{villages.length}</div>
                <div className="text-[10px] text-gray-500">변경 마을</div>
              </div>
              <div className="bg-green-50 rounded-lg py-2">
                <div className="text-lg font-bold text-green-700">{gainedCount}</div>
                <div className="text-[10px] text-green-600">NEW</div>
              </div>
              <div className="bg-red-50 rounded-lg py-2">
                <div className="text-lg font-bold text-red-700">{lostCount}</div>
                <div className="text-[10px] text-red-600">소멸</div>
              </div>
              <div className="bg-amber-50 rounded-lg py-2">
                <div className="text-lg font-bold text-amber-700">{mixedCount}</div>
                <div className="text-[10px] text-amber-600">혼합</div>
              </div>
            </div>
          </div>

          {/* 마을 목록 */}
          <div className="flex-1 overflow-y-auto">
            {villages.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                해당 조건의 변경이 없습니다.
              </div>
            ) : (
              villages.map((v) => (
                <VillageCard
                  key={v.address}
                  village={v}
                  onClick={() => {
                    const first = v.rows[0];
                    onVillageClick?.(v.address, first.lat, first.lng);
                  }}
                />
              ))
            )}
          </div>
        </>
      )}

      {results === null && !loading && (
        <div className="px-5 py-8 text-center">
          <div className="text-sm text-gray-600 mb-2">
            기준일 대비 현재의 <b>여유 상태 변화</b>를 분석합니다.
          </div>
          <div className="text-xs text-gray-400 space-y-1">
            <p>여유가 새로 생긴 곳 = <span className="text-green-600 font-medium">NEW (사업 기회)</span></p>
            <p>여유가 사라진 곳 = <span className="text-red-600 font-medium">소멸 (경쟁 심화)</span></p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 필터 행 ──

function FilterRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 font-medium w-14 flex-shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FilterValue)}
        className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs text-gray-900 bg-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none"
      >
        {FILTER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── 마을 카드 ──

function VillageCard({ village: v, onClick }: { village: VillageStats; onClick?: () => void }) {
  const dirConfig = {
    improved: {
      badge: "NEW",
      badgeCls: "bg-green-100 text-green-700 border-green-200",
      borderCls: "border-l-green-500",
      icon: "\u25B2",
    },
    worsened: {
      badge: "소멸",
      badgeCls: "bg-red-100 text-red-700 border-red-200",
      borderCls: "border-l-red-500",
      icon: "\u25BC",
    },
    mixed: {
      badge: "혼합",
      badgeCls: "bg-amber-100 text-amber-700 border-amber-200",
      borderCls: "border-l-amber-500",
      icon: "\u2195",
    },
    unchanged: {
      badge: "동일",
      badgeCls: "bg-gray-100 text-gray-600 border-gray-200",
      borderCls: "border-l-gray-300",
      icon: "=",
    },
  }[v.direction];

  const liPart = v.addr_li && v.addr_li !== "-기타지역" ? ` ${v.addr_li}` : "";

  // 시설별 변화 요약
  const facilityChanges: { label: string; prevOk: boolean; currOk: boolean }[] = [];
  // 대표 행 기준 (첫 번째 행)
  const first = v.rows[0];
  facilityChanges.push(
    { label: "변전소", prevOk: first.prev_subst_ok, currOk: first.curr_subst_ok },
    { label: "주변압기", prevOk: first.prev_mtr_ok, currOk: first.curr_mtr_ok },
    { label: "배전선로", prevOk: first.prev_dl_ok, currOk: first.curr_dl_ok },
  );

  return (
    <div
      className={`px-4 py-3 border-b border-gray-50 border-l-4 ${dirConfig.borderCls} hover:bg-orange-50/50 transition-colors cursor-pointer`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-800">
          {v.addr_dong}{liPart}
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${dirConfig.badgeCls}`}>
          {dirConfig.icon} {dirConfig.badge}
        </span>
      </div>

      <div className="flex gap-3">
        {facilityChanges.map((f) => (
          <FacilityBadge key={f.label} {...f} />
        ))}
      </div>

      <div className="mt-2 text-[10px] text-gray-400">
        {v.totalChanged}건 — 마커 클릭으로 상세 확인
      </div>
    </div>
  );
}

function FacilityBadge({ label, prevOk, currOk }: { label: string; prevOk: boolean; currOk: boolean }) {
  const prevLabel = prevOk ? "여유" : "없음";
  const currLabel = currOk ? "여유" : "없음";
  const changed = prevOk !== currOk;

  return (
    <div className="text-[10px]">
      <span className="text-gray-500">{label}</span>
      <div className={`font-bold ${changed ? (currOk ? "text-green-600" : "text-red-600") : "text-gray-400"}`}>
        {prevLabel} → {currLabel}
      </div>
    </div>
  );
}
