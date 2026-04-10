"use client";

import { useEffect, useState } from "react";
import type { CompareRow } from "@/app/api/compare/route";

interface Props {
  onResults: (rows: CompareRow[]) => void;
  onClose: () => void;
  onVillageClick?: (geocodeAddress: string, lat: number, lng: number) => void;
}

// ── 유틸 ──

function volRank(vol: string | null): number {
  if (!vol) return 0;
  if (vol.includes("여유")) return 1;
  if (vol.includes("보통")) return 2;
  if (vol.includes("주의")) return 3;
  if (vol.includes("위험")) return 4;
  return 0;
}

function volDelta(prev: string | null, cur: string | null): number {
  return volRank(cur) - volRank(prev);
}

export type ChangeDirection = "improved" | "worsened" | "mixed";

export function getChangeDirection(row: CompareRow): ChangeDirection {
  const d1 = volDelta(row.prev_vol_subst, row.cur_vol_subst);
  const d2 = volDelta(row.prev_vol_mtr, row.cur_vol_mtr);
  const d3 = volDelta(row.prev_vol_dl, row.cur_vol_dl);
  const sum = d1 + d2 + d3;
  if (sum < 0) return "improved";
  if (sum > 0) return "worsened";
  const hasUp = d1 > 0 || d2 > 0 || d3 > 0;
  const hasDown = d1 < 0 || d2 < 0 || d3 < 0;
  if (hasUp && hasDown) return "mixed";
  if (hasDown) return "improved";
  if (hasUp) return "worsened";
  return "mixed";
}

const VOL_SHORT: Record<string, string> = {
  "여유용량 있음": "여유",
  보통: "보통",
  주의: "주의",
  위험: "위험",
};

function shortVol(v: string | null): string {
  if (!v) return "-";
  return VOL_SHORT[v] || v;
}

function volColor(v: string | null): string {
  if (!v) return "text-gray-400";
  if (v.includes("여유")) return "text-green-600";
  if (v.includes("보통")) return "text-blue-600";
  if (v.includes("주의")) return "text-yellow-600";
  if (v.includes("위험")) return "text-red-600";
  return "text-gray-400";
}

// 마을 단위 잔여 kW 변화 계산
interface VillageStats {
  address: string;
  addr_dong: string | null;
  addr_li: string | null;
  rows: CompareRow[];
  direction: ChangeDirection;
  // 시설별 상태 변화 패턴
  substPattern: string | null; // "여유 → 주의" 등
  mtrPattern: string | null;
  dlPattern: string | null;
  // 건수
  totalChanged: number;
}

function analyzeVillage(rows: CompareRow[]): VillageStats {
  const first = rows[0];

  // 방향: 전체 rows에서 판단
  const dirs = rows.map(getChangeDirection);
  const hasWorsen = dirs.includes("worsened");
  const hasImprove = dirs.includes("improved");
  let direction: ChangeDirection = "mixed";
  if (hasWorsen && !hasImprove) direction = "worsened";
  else if (hasImprove && !hasWorsen) direction = "improved";

  // 시설별 대표 패턴 (가장 많은 패턴)
  function getPattern(prevKey: keyof CompareRow, curKey: keyof CompareRow): string | null {
    const changed = rows.filter((r) => r[prevKey] !== r[curKey]);
    if (changed.length === 0) return null;
    const counts = new Map<string, number>();
    for (const r of changed) {
      const k = `${shortVol(r[prevKey] as string | null)} → ${shortVol(r[curKey] as string | null)}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let best = "";
    let bestN = 0;
    counts.forEach((n, k) => { if (n > bestN) { best = k; bestN = n; } });
    return bestN > 1 ? `${best} (${bestN}건)` : best;
  }

  return {
    address: first.geocode_address,
    addr_dong: first.addr_dong,
    addr_li: first.addr_li,
    rows,
    direction,
    substPattern: getPattern("prev_vol_subst", "cur_vol_subst"),
    mtrPattern: getPattern("prev_vol_mtr", "cur_vol_mtr"),
    dlPattern: getPattern("prev_vol_dl", "cur_vol_dl"),
    totalChanged: rows.length,
  };
}

// ── 메인 컴포넌트 ──

export default function ComparePanel({ onResults, onClose, onVillageClick }: Props) {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CompareRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "opportunity" | "risk">("all");

  useEffect(() => {
    fetch("/api/compare/dates")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.dates.length > 0) {
          setDates(d.dates);
          setSelectedDate(d.dates[0]);
        }
      })
      .catch(() => {});
  }, []);

  const handleCompare = async () => {
    if (!selectedDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/compare?date=${selectedDate}`);
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
          {} as Record<string, CompareRow[]>
        )
      ).map(analyzeVillage)
    : [];

  // 필터
  const filtered = villages.filter((v) => {
    if (filter === "opportunity") return v.direction === "improved";
    if (filter === "risk") return v.direction === "worsened" || v.direction === "mixed";
    return true;
  });

  // 정렬: 기회(개선)를 위로
  filtered.sort((a, b) => {
    const order: Record<ChangeDirection, number> = { improved: 0, mixed: 1, worsened: 2 };
    return order[a.direction] - order[b.direction];
  });

  const opportunityCount = villages.filter((v) => v.direction === "improved").length;
  const riskCount = villages.filter((v) => v.direction === "worsened" || v.direction === "mixed").length;

  return (
    <div className="absolute top-3 left-[340px] z-20 w-[380px] max-h-[calc(100vh-80px)] bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-orange-500">
            <path d="M8 1v14M3 4l2-2 2 2M11 12l2 2 2-2M3 5v6M13 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          용량 변화 분석
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
          &times;
        </button>
      </div>

      {/* 날짜 선택 */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-bold text-gray-900 bg-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none"
          >
            {dates.length === 0 && <option value="">기록된 변경이 없습니다</option>}
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="text-sm font-medium text-gray-500 whitespace-nowrap">~ 오늘</span>
          <button
            onClick={handleCompare}
            disabled={!selectedDate || loading}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-md disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {loading ? "분석 중..." : "비교"}
          </button>
        </div>
      </div>

      {/* 결과 */}
      {results !== null && (
        <>
          {/* 요약 카드 */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg py-2">
                <div className="text-lg font-bold text-gray-800">{villages.length}</div>
                <div className="text-[10px] text-gray-500">변경된 마을</div>
              </div>
              <div className="bg-green-50 rounded-lg py-2">
                <div className="text-lg font-bold text-green-700">{opportunityCount}</div>
                <div className="text-[10px] text-green-600">여유 증가</div>
              </div>
              <div className="bg-red-50 rounded-lg py-2">
                <div className="text-lg font-bold text-red-700">{riskCount}</div>
                <div className="text-[10px] text-red-600">여유 감소</div>
              </div>
            </div>
          </div>

          {/* 필터 */}
          <div className="px-4 py-2 border-b border-gray-100 flex gap-1.5">
            {([
              { key: "all" as const, label: "전체", cls: "bg-gray-200 text-gray-800" },
              { key: "opportunity" as const, label: "여유 증가 (기회)", cls: "bg-green-100 text-green-700" },
              { key: "risk" as const, label: "여유 감소 (주의)", cls: "bg-red-100 text-red-700" },
            ]).map(({ key, label, cls }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                  filter === key ? `${cls} font-bold` : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 마을 목록 */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                해당하는 변경이 없습니다.
              </div>
            ) : (
              filtered.map((v) => (
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
            지난 수집과 오늘의 <b>용량 변화</b>를 분석합니다.
          </div>
          <div className="text-xs text-gray-400 space-y-1">
            <p>여유용량이 새로 생긴 곳 = <span className="text-green-600 font-medium">사업 기회</span></p>
            <p>여유용량이 줄어든 곳 = <span className="text-red-600 font-medium">경쟁 심화</span></p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 마을 카드 ──

function VillageCard({ village: v, onClick }: { village: VillageStats; onClick?: () => void }) {
  const dirConfig = {
    improved: {
      badge: "여유 증가",
      badgeCls: "bg-green-100 text-green-700 border-green-200",
      borderCls: "border-l-green-500",
      icon: "\u25B2", // ▲
    },
    worsened: {
      badge: "여유 감소",
      badgeCls: "bg-red-100 text-red-700 border-red-200",
      borderCls: "border-l-red-500",
      icon: "\u25BC", // ▼
    },
    mixed: {
      badge: "혼합 변동",
      badgeCls: "bg-amber-100 text-amber-700 border-amber-200",
      borderCls: "border-l-amber-500",
      icon: "\u2195", // ↕
    },
  }[v.direction];

  const liPart = v.addr_li && v.addr_li !== "-기타지역" ? ` ${v.addr_li}` : "";

  return (
    <div
      className={`px-4 py-3 border-b border-gray-50 border-l-4 ${dirConfig.borderCls} hover:bg-orange-50/50 transition-colors cursor-pointer`}
      onClick={onClick}
    >
      {/* 마을명 + 배지 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-800">
          {v.addr_dong}{liPart}
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${dirConfig.badgeCls}`}>
          {dirConfig.icon} {dirConfig.badge}
        </span>
      </div>

      {/* 시설별 변화 */}
      <div className="space-y-1">
        {v.substPattern && (
          <FacilityLine label="변전소" pattern={v.substPattern} rows={v.rows} prevKey="prev_vol_subst" curKey="cur_vol_subst" />
        )}
        {v.mtrPattern && (
          <FacilityLine label="주변압기" pattern={v.mtrPattern} rows={v.rows} prevKey="prev_vol_mtr" curKey="cur_vol_mtr" />
        )}
        {v.dlPattern && (
          <FacilityLine label="배전선로" pattern={v.dlPattern} rows={v.rows} prevKey="prev_vol_dl" curKey="cur_vol_dl" />
        )}
      </div>

      {/* 안내 */}
      <div className="mt-2 text-[10px] text-gray-400">
        {v.totalChanged}건 변경 — 마커 클릭으로 지번별 상세 확인
      </div>
    </div>
  );
}

function FacilityLine({
  label,
  pattern,
  rows,
  prevKey,
  curKey,
}: {
  label: string;
  pattern: string;
  rows: CompareRow[];
  prevKey: keyof CompareRow;
  curKey: keyof CompareRow;
}) {
  // 대표 row에서 이전/현재 상태 추출
  const changed = rows.filter((r) => r[prevKey] !== r[curKey]);
  if (changed.length === 0) return null;
  const sample = changed[0];
  const prev = sample[prevKey] as string | null;
  const cur = sample[curKey] as string | null;
  const delta = volDelta(prev, cur);

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-gray-500 font-medium w-12 flex-shrink-0">{label}</span>
      <span className={`font-bold ${volColor(prev)}`}>{shortVol(prev)}</span>
      <span className={`text-xs font-bold ${delta > 0 ? "text-red-500" : delta < 0 ? "text-green-500" : "text-gray-400"}`}>
        →
      </span>
      <span className={`font-bold ${volColor(cur)}`}>{shortVol(cur)}</span>
      {changed.length > 1 && (
        <span className="text-[10px] text-gray-400 ml-auto">{changed.length}건</span>
      )}
    </div>
  );
}
