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
import type { SearchRiResult } from "@/lib/search/searchKepco";
import { FacilityCard, StepBlock } from "./FacilityCard";

export type SearchPick =
  | { kind: "ri"; row: SearchRiResult }
  | { kind: "ji"; row: KepcoDataRow };

interface Props {
  mode: "ri" | "ji";
  ri: SearchRiResult[];
  ji: KepcoDataRow[];
  onPick: (pick: SearchPick) => void;
}

/** 행정구역 5개 컬럼을 한 줄 주소 텍스트로 합친다 */
function joinAddress(parts: {
  addr_do: string | null;
  addr_si: string | null;
  addr_gu: string | null;
  addr_dong: string | null;
  addr_li: string | null;
}): string {
  return [parts.addr_do, parts.addr_si, parts.addr_gu, parts.addr_dong, parts.addr_li]
    .filter((s) => s && s.trim() && s !== "-기타지역")
    .join(" ");
}

export default function SearchResultList({ mode, ri, ji, onPick }: Props) {
  // 지번 행 펼침 상태 (id 집합)
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">
                  {joinAddress(r)}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  총 <span className="font-semibold text-blue-600">{r.cnt.toLocaleString()}건</span>
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

  // 지번 행 클릭: ① 지도 이동(onPick) ② 인라인 펼침 토글 동시 처리
  const handleJiClick = (row: KepcoDataRow) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    onPick({ kind: "ji", row });
  };

  return (
    <ul className="divide-y divide-gray-100">
      {ji.map((row) => {
        const isOpen = expanded.has(row.id);
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => handleJiClick(row)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                isOpen ? "bg-blue-50" : "hover:bg-blue-50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-gray-900 truncate">
                  {joinAddress(row)}{" "}
                  <span className="text-blue-600 font-semibold">{row.addr_jibun}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                  {[row.subst_nm, row.mtr_no, row.dl_nm].filter(Boolean).join(" · ") || "-"}
                </div>
              </div>
              <div
                className={`text-blue-500 text-xs flex-shrink-0 transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
              >
                ▶
              </div>
            </button>

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
      <div className="grid grid-cols-3 gap-2">
        <FacilityCard
          title="변전소"
          name={row.subst_nm ?? "-"}
          ok={row.vol_subst === "여유용량 있음"}
          base={row.subst_capa}
          received={row.subst_pwr}
          planned={row.g_subst_capa}
        />
        <FacilityCard
          title="주변압기"
          name={`#${row.mtr_no ?? "-"}`}
          ok={row.vol_mtr === "여유용량 있음"}
          base={row.mtr_capa}
          received={row.mtr_pwr}
          planned={row.g_mtr_capa}
        />
        <FacilityCard
          title="배전선로"
          name={row.dl_nm ?? "-"}
          ok={row.vol_dl === "여유용량 있음"}
          base={row.dl_capa}
          received={row.dl_pwr}
          planned={row.g_dl_capa}
        />
      </div>

      {hasStep && (
        <div className="bg-white border border-gray-200 rounded-md p-2.5">
          <div className="text-[11px] font-bold text-gray-700 mb-1.5">
            📋 접속 예정 단계
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <StepBlock label="접수" cnt={row.step1_cnt} pwr={row.step1_pwr} />
            <StepBlock label="공용망 보강" cnt={row.step2_cnt} pwr={row.step2_pwr} />
            <StepBlock label="접속 공사" cnt={row.step3_cnt} pwr={row.step3_pwr} />
          </div>
        </div>
      )}
    </div>
  );
}
