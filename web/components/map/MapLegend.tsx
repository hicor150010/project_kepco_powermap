"use client";

/**
 * 지도 마커 범례 — 단순화 버전.
 *
 * 새 마커는 3줄 비율 막대(변전소·주변압기·배전선로)이고,
 * 각 줄에서 빨간 길이가 부족 비율을 의미한다.
 * 사용자가 한눈에 파악할 수 있도록 예시 마커 + 한 문장 설명만 둔다.
 */

import { useState, useEffect } from "react";
import { STATUS_RED, STATUS_BLUE } from "@/lib/markerColor";

const LEGEND_SEEN_KEY = "kepco_legend_seen";

export default function MapLegend() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem(LEGEND_SEEN_KEY);
  });

  // 첫 방문 후 한 번 펼치면 기록
  useEffect(() => {
    if (open && !localStorage.getItem(LEGEND_SEEN_KEY)) {
      localStorage.setItem(LEGEND_SEEN_KEY, "1");
    }
  }, [open]);

  return (
    <div>
      <div className="overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-1 py-1 text-[11px] text-gray-500 hover:text-gray-700"
        >
          <span>🎨 마커 보는 법</span>
          <span className="text-gray-400 text-[10px]">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="px-1 pb-2 pt-1.5 border-t border-gray-100 flex items-start gap-3">
            {/* 예시 마커 + 줄 라벨 */}
            <div className="flex items-center gap-1.5">
              <ExampleMarker />
              <div className="flex flex-col text-[10px] text-gray-600 leading-[10px] gap-[3px] mt-1">
                <span>변전소</span>
                <span>주변압기</span>
                <span>배전선로</span>
              </div>
            </div>

            {/* 색 의미 — 한 줄 */}
            <div className="text-[10px] text-gray-700 leading-snug border-l border-gray-200 pl-3">
              <div className="flex items-center gap-1 mb-1">
                <span
                  className="inline-block w-3 h-2 rounded-sm"
                  style={{ background: STATUS_RED }}
                />
                <span>부족 비율</span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-2 rounded-sm"
                  style={{ background: STATUS_BLUE }}
                />
                <span>여유 비율</span>
              </div>
              <div className="text-[9px] text-gray-400 mt-1.5">
                길이 = 비율
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 예시 마커 — 변전소 75%부족 / 주변압기 0% / 배전선로 38% */
function ExampleMarker() {
  const W = 28;
  const H = 38;
  const cardH = 30;
  const stripeW = W - 6;
  const r = (pct: number) => (stripeW * pct) / 100;

  return (
    <svg width="32" height="44" viewBox={`0 0 ${W} ${H}`}>
      {/* 화살표 */}
      <path
        d={`M${W / 2 - 5} ${cardH} L${W / 2} ${H - 1} L${W / 2 + 5} ${cardH} Z`}
        fill="white"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* 카드 */}
      <rect
        x="0.5"
        y="0.5"
        width={W - 1}
        height={cardH - 1}
        rx="3"
        fill="white"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1"
      />
      {/* 줄 1 — 변전소 75% 부족 */}
      <rect x="3" y="4" width={stripeW} height="6" rx="1" fill={STATUS_BLUE} />
      <rect x="3" y="4" width={r(75)} height="6" rx="1" fill={STATUS_RED} />
      {/* 줄 2 — 주변압기 0% 부족 (전부 여유) */}
      <rect x="3" y="12" width={stripeW} height="6" rx="1" fill={STATUS_BLUE} />
      {/* 줄 3 — 배전선로 38% 부족 */}
      <rect x="3" y="20" width={stripeW} height="6" rx="1" fill={STATUS_BLUE} />
      <rect x="3" y="20" width={r(38)} height="6" rx="1" fill={STATUS_RED} />
      {/* 이음새 */}
      <line
        x1={W / 2 - 5}
        y1={cardH - 0.5}
        x2={W / 2 + 5}
        y2={cardH - 0.5}
        stroke="white"
        strokeWidth="1.2"
      />
    </svg>
  );
}
