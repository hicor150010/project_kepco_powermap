"use client";

import { useEffect, useState } from "react";
import type { CompareRow } from "@/app/api/compare/route";

interface Props {
  onResults: (rows: CompareRow[]) => void;
  onClose: () => void;
}

// 상태 텍스트 → 등급 (높을수록 나쁨)
function volRank(vol: string | null): number {
  if (!vol) return 0;
  if (vol.includes("여유")) return 1;
  if (vol.includes("보통")) return 2;
  if (vol.includes("주의")) return 3;
  if (vol.includes("위험")) return 4;
  return 0;
}

// 상태 변화 방향: 양수=악화, 음수=개선
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
  // 개별적으로 개선/악화가 섞여있으면 mixed
  const hasUp = d1 > 0 || d2 > 0 || d3 > 0;
  const hasDown = d1 < 0 || d2 < 0 || d3 < 0;
  if (hasUp && hasDown) return "mixed";
  if (hasDown) return "improved";
  if (hasUp) return "worsened";
  return "mixed";
}

const VOL_SHORT: Record<string, string> = {
  "여유용량 있음": "여유",
  "보통": "보통",
  "주의": "주의",
  "위험": "위험",
};

function shortVol(v: string | null): string {
  if (!v) return "-";
  return VOL_SHORT[v] || v;
}

function volBadgeColor(v: string | null): string {
  if (!v) return "bg-gray-100 text-gray-500";
  if (v.includes("여유")) return "bg-green-100 text-green-700";
  if (v.includes("보통")) return "bg-blue-100 text-blue-700";
  if (v.includes("주의")) return "bg-yellow-100 text-yellow-800";
  if (v.includes("위험")) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-500";
}

function ArrowIcon({ direction }: { direction: number }) {
  if (direction < 0)
    return <span className="text-green-600 text-xs font-bold">&#9650;</span>; // ▲ 개선
  if (direction > 0)
    return <span className="text-red-600 text-xs font-bold">&#9660;</span>; // ▼ 악화
  return <span className="text-gray-400 text-xs">-</span>;
}

export default function ComparePanel({ onResults, onClose }: Props) {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CompareRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "improved" | "worsened">("all");

  // 날짜 목록 로드
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

  // 마을(geocode_address) 단위로 그룹핑
  const grouped = results
    ? Object.values(
        results.reduce(
          (acc, row) => {
            const key = row.geocode_address;
            if (!acc[key]) {
              acc[key] = { address: key, rows: [], addr_dong: row.addr_dong, addr_li: row.addr_li };
            }
            acc[key].rows.push(row);
            return acc;
          },
          {} as Record<string, { address: string; rows: CompareRow[]; addr_dong: string | null; addr_li: string | null }>
        )
      )
    : [];

  const filteredGroups = grouped.filter((g) => {
    if (filter === "all") return true;
    // 마을 내 변경 방향 판단 (첫 번째 row 기준으로 간단 판단)
    const dirs = g.rows.map(getChangeDirection);
    if (filter === "improved") return dirs.some((d) => d === "improved");
    if (filter === "worsened") return dirs.some((d) => d === "worsened");
    return true;
  });

  const improvedCount = grouped.filter((g) =>
    g.rows.some((r) => getChangeDirection(r) === "improved")
  ).length;
  const worsenedCount = grouped.filter((g) =>
    g.rows.some((r) => getChangeDirection(r) === "worsened")
  ).length;

  return (
    <div className="absolute top-3 left-[340px] z-20 w-[360px] max-h-[calc(100vh-80px)] bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-orange-500">
            <path d="M8 1v14M3 4l2-2 2 2M11 12l2 2 2-2M3 5v6M13 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          변경 비교
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
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
            {dates.length === 0 && (
              <option value="">기록된 변경이 없습니다</option>
            )}
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
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
          {/* 요약 */}
          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3 text-xs">
            <span className="text-gray-500">
              총 <b className="text-gray-900">{grouped.length}</b>개 마을 변경
            </span>
            {improvedCount > 0 && (
              <span className="text-green-600">
                &#9650; 개선 {improvedCount}
              </span>
            )}
            {worsenedCount > 0 && (
              <span className="text-red-600">
                &#9660; 악화 {worsenedCount}
              </span>
            )}
          </div>

          {/* 필터 탭 */}
          <div className="px-4 py-1.5 border-b border-gray-100 flex gap-1">
            {(["all", "worsened", "improved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  filter === f
                    ? f === "worsened"
                      ? "bg-red-100 text-red-700 font-medium"
                      : f === "improved"
                        ? "bg-green-100 text-green-700 font-medium"
                        : "bg-gray-200 text-gray-800 font-medium"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {f === "all" ? "전체" : f === "worsened" ? "악화" : "개선"}
              </button>
            ))}
          </div>

          {/* 변경 목록 */}
          <div className="flex-1 overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                해당하는 변경이 없습니다.
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.address}
                  className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <div className="text-xs font-semibold text-gray-800 mb-1.5">
                    {group.addr_dong} {group.addr_li && group.addr_li !== "-기타지역" ? group.addr_li : ""}
                    <span className="text-gray-400 font-normal ml-1">
                      ({group.rows.length}건)
                    </span>
                  </div>
                  {/* 개별 변경 항목 (최대 5건 표시) */}
                  <div className="space-y-1">
                    {group.rows.slice(0, 5).map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        {/* 변전소 */}
                        <div className="flex items-center gap-0.5">
                          <span className="text-gray-400 w-4">변</span>
                          <span className={`px-1 py-0.5 rounded text-[10px] ${volBadgeColor(row.prev_vol_subst)}`}>
                            {shortVol(row.prev_vol_subst)}
                          </span>
                          <ArrowIcon direction={volDelta(row.prev_vol_subst, row.cur_vol_subst)} />
                          <span className={`px-1 py-0.5 rounded text-[10px] ${volBadgeColor(row.cur_vol_subst)}`}>
                            {shortVol(row.cur_vol_subst)}
                          </span>
                        </div>
                        <span className="text-gray-300">|</span>
                        {/* 주변압기 */}
                        <div className="flex items-center gap-0.5">
                          <span className="text-gray-400 w-4">주</span>
                          <span className={`px-1 py-0.5 rounded text-[10px] ${volBadgeColor(row.prev_vol_mtr)}`}>
                            {shortVol(row.prev_vol_mtr)}
                          </span>
                          <ArrowIcon direction={volDelta(row.prev_vol_mtr, row.cur_vol_mtr)} />
                          <span className={`px-1 py-0.5 rounded text-[10px] ${volBadgeColor(row.cur_vol_mtr)}`}>
                            {shortVol(row.cur_vol_mtr)}
                          </span>
                        </div>
                        <span className="text-gray-300">|</span>
                        {/* 배전선로 */}
                        <div className="flex items-center gap-0.5">
                          <span className="text-gray-400 w-4">배</span>
                          <span className={`px-1 py-0.5 rounded text-[10px] ${volBadgeColor(row.prev_vol_dl)}`}>
                            {shortVol(row.prev_vol_dl)}
                          </span>
                          <ArrowIcon direction={volDelta(row.prev_vol_dl, row.cur_vol_dl)} />
                          <span className={`px-1 py-0.5 rounded text-[10px] ${volBadgeColor(row.cur_vol_dl)}`}>
                            {shortVol(row.cur_vol_dl)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {group.rows.length > 5 && (
                      <div className="text-[10px] text-gray-400">
                        ... 외 {group.rows.length - 5}건
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {results === null && !loading && (
        <div className="p-6 text-center text-sm text-gray-400">
          날짜를 선택하고 비교 버튼을 눌러주세요.
          <br />
          <span className="text-xs">선택한 날짜 ~ 오늘 사이 변경된 마을을 보여줍니다.</span>
        </div>
      )}
    </div>
  );
}
