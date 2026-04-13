"use client";

/**
 * 검색 결과 리스트.
 *
 * 한 컴포넌트에서 두 모드를 모두 렌더한다 (mode prop으로 분기):
 *   - "ri" : 리 단위 그룹 (행정구역 + 건수)
 *   - "ji" : 지번 단위 개별 행 (시설 정보) — 클릭 시 인라인 펼침
 *
 * 클릭 시 부모(SearchPanel)로 onPick 콜백을 흘려보낸다.
 * 부모는 좌표를 받아 지도 이동만 처리한다 (카드/모달 자동 X).
 *
 * 지번 행은 추가로 "그 자리에서 펼침" 동작을 가진다.
 *   - 검색 결과 행 자체에 KepcoDataRow 정보가 다 들어 있어 추가 fetch 불필요
 *   - 시설 정보(변전소/주변압기/배전선로)를 FacilityCard 3장으로 표시
 */

import { useState } from "react";
import type { KepcoDataRow } from "@/lib/types";
import { hasCapacity } from "@/lib/types";
import type { SearchRiResult } from "@/lib/search/searchKepco";
import { FacilityCard, StepBlock } from "./FacilityCard";

export type SearchPick =
  | { kind: "ri"; row: SearchRiResult }
  | { kind: "ji"; row: KepcoDataRow }
  | { kind: "ji_compare"; row: { geocode_address: string; lat: number; lng: number }; jibun: string };

interface Props {
  mode: "ri" | "ji";
  ri: SearchRiResult[];
  ji: KepcoDataRow[];
  onPick: (pick: SearchPick) => void;
  onJibunPin?: (row: KepcoDataRow) => void;
  selectedAddr?: string | null;
}

/** 행정구역 5개 컬럼을 한 줄 주소 텍스트로 합친다 */
function joinAddress(parts: {
  addr_do: string | null;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
}): string {
  return [parts.addr_do, parts.addr_si, parts.addr_gu, parts.addr_dong,
    parts.addr_li && !parts.addr_li.includes("기타지역") ? parts.addr_li : null]
    .filter((s) => s && s.trim())
    .join(" ");
}

/** "-기타지역" 부분을 회색 작은 글씨로 렌더링 */
function AddrSpan({ text }: { text: string }) {
  const parts = text.split(/(\S*기타지역\S*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.includes("기타지역") ? (
          <span key={i} className="text-[10px] text-gray-400 font-normal">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export default function SearchResultList({ mode, ri, ji, onPick, onJibunPin, selectedAddr }: Props) {
  // 지번 행 펼침 상태 (하나만 열림)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (mode === "ri") {
    if (ri.length === 0) {
      return (
        <div className="px-6 py-10 text-center">
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-xs font-medium text-gray-700 mb-1">
            일치하는 마을이 없어요
          </div>
          <div className="text-[11px] text-gray-500 leading-relaxed">
            다른 키워드로 다시 시도해 보세요.<br />
            (예: <span className="text-gray-700 font-medium">담양읍</span>,{" "}
            <span className="text-gray-700 font-medium">용구리</span>)
          </div>
        </div>
      );
    }
    return (
      <ul className="divide-y divide-gray-100">
        {ri.map((r, i) => (
          <li key={`${r.addr_li ?? ""}-${i}`}>
            <button
              type="button"
              onClick={() => onPick({ kind: "ri", row: r })}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                selectedAddr && r.geocode_address === selectedAddr
                  ? "bg-blue-50 border-l-2 border-blue-500"
                  : "hover:bg-blue-50 active:bg-blue-100"
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">
                  <AddrSpan text={joinAddress(r)} />
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  총 <span className="font-semibold text-blue-600">{r.cnt.toLocaleString()}건</span>
                  {r.lat == null && <span className="text-orange-400 ml-1">(좌표 미확인)</span>}
                </div>
              </div>
              <div className="text-blue-500 text-xs flex-shrink-0">→</div>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  // mode === "ji"
  if (ji.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <div className="text-3xl mb-2">🔍</div>
        <div className="text-xs font-medium text-gray-700 mb-1">
          지번 단위 결과가 없어요
        </div>
        <div className="text-[11px] text-gray-500 leading-relaxed">
          검색어에 <span className="text-gray-700 font-medium">번지 숫자</span>를
          포함해 보세요.<br />
          (예: <span className="text-gray-700 font-medium">용구리 100</span>)
        </div>
      </div>
    );
  }

  // 펼침/접기 — 하나만 열림 (아코디언)
  const handleToggleExpand = (row: KepcoDataRow) => {
    setExpandedId((prev) => prev === row.id ? null : row.id);
  };

  // 지도 이동 (onPick 호출 → 사이드바 닫힘)
  const handleJiPick = (row: KepcoDataRow) => {
    onPick({ kind: "ji", row });
  };

  return (
    <ul className="divide-y divide-gray-100">
      {ji.map((row) => {
        const isOpen = expandedId === row.id;
        return (
          <li key={row.id}>
            <div
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                isOpen ? "bg-blue-50" : "hover:bg-blue-50"
              }`}
            >
              <div
                className="min-w-0 flex-1 flex items-center gap-1.5 cursor-pointer active:opacity-70"
                onClick={() => handleJiPick(row)}
              >
                <div className="text-xs font-medium text-gray-900 truncate min-w-0 flex-1">
                  <AddrSpan text={joinAddress(row)} />
                </div>
                {onJibunPin && row.addr_jibun ? (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJibunPin(row);
                    }}
                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-1 rounded text-blue-600 font-semibold hover:bg-blue-100 active:bg-blue-200 cursor-pointer transition-colors text-xs"
                    title="지도에서 이 지번 위치 보기"
                  >
                    <span className="text-[10px]">📍</span>
                    {row.addr_jibun}
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-xs text-blue-600 font-semibold">{row.addr_jibun}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleToggleExpand(row)}
                className={`text-blue-500 text-xs flex-shrink-0 transition-transform p-2 -m-2 ${
                  isOpen ? "rotate-90" : ""
                }`}
              >
                ▶
              </button>
            </div>

            {/* 인라인 펼침 — 시설 카드 3장 + STEP 정보 */}
            {isOpen && <JibunDetail row={row} />}
          </li>
        );
      })}
    </ul>
  );
}

/** 검색 결과 한 지번의 상세 — LocationDetailModal의 DetailContent 와 동일한 룩 */
function JibunDetail({ row }: { row: KepcoDataRow }) {
  const hasStep =
    row.step1_cnt != null || row.step2_cnt != null || row.step3_cnt != null;

  return (
    <div className="px-4 py-3 bg-blue-50/40 border-t border-blue-100 space-y-3">
      <div className="grid grid-cols-1 gap-2">
        <FacilityCard
          title="변전소"
          name={row.subst_nm ?? "-"}
          ok={hasCapacity(row.subst_capa, row.subst_pwr, row.g_subst_capa)}
          base={row.subst_capa}
          received={row.subst_pwr}
          planned={row.g_subst_capa}
        />
        <FacilityCard
          title="주변압기"
          name={`#${row.mtr_no ?? "-"}`}
          ok={hasCapacity(row.mtr_capa, row.mtr_pwr, row.g_mtr_capa)}
          base={row.mtr_capa}
          received={row.mtr_pwr}
          planned={row.g_mtr_capa}
        />
        <FacilityCard
          title="배전선로"
          name={row.dl_nm ?? "-"}
          ok={hasCapacity(row.dl_capa, row.dl_pwr, row.g_dl_capa)}
          base={row.dl_capa}
          received={row.dl_pwr}
          planned={row.g_dl_capa}
        />
      </div>

      {hasStep && (
        <div className="bg-white border border-gray-200 rounded-md p-2.5">
          <div className="text-[12px] font-bold text-gray-700 mb-1.5">
            📋 접속 예정 단계
          </div>
          <div className="grid grid-cols-1 gap-2 text-[12px]">
            <StepBlock label="접수" cnt={row.step1_cnt} pwr={row.step1_pwr} />
            <StepBlock label="공용망 보강" cnt={row.step2_cnt} pwr={row.step2_pwr} />
            <StepBlock label="접속 공사" cnt={row.step3_cnt} pwr={row.step3_pwr} />
          </div>
        </div>
      )}
    </div>
  );
}
