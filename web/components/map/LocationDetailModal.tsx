"use client";

import { useMemo, useState, useEffect } from "react";
import type { KepcoDataRow } from "@/lib/types";
import { FacilityCard, StepBlock } from "./FacilityCard";
import LocationDetailGrouped from "./LocationDetailGrouped";
import { formatRemaining } from "@/lib/summarize";
import AddrLine from "./AddrLine";

/**
 * 보기 모드.
 *   - "table" : 기존 표 뷰 (번지 단위, 컬럼 정렬 가능)
 *   - "group" : 그룹 뷰 (같은 시설끼리 묶어서 한 단위로)
 */
type ViewMode = "table" | "group";

interface Props {
  rows: KepcoDataRow[];
  onClose: () => void;
  onJibunPin?: (row: KepcoDataRow) => void;
}

type SortKey =
  | "addr_jibun"
  | "subst_nm"
  | "vol_subst"
  | "mtr_no"
  | "vol_mtr"
  | "dl_nm"
  | "vol_dl";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 50;

export default function LocationDetailModal({ rows, onClose, onJibunPin }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("addr_jibun");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // ESC 키로 닫기 — 입력 중이어도 동작하지만 검색창 포커스 시엔
  // 브라우저 기본 동작(값 초기화)과 충돌 방지를 위해 막지 않음
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(rows.map((r) => r.id)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const first = rows[0];
  const addrFields: { label: string; value: string | null | undefined }[] = [
    { label: "시/도", value: first?.addr_do },
    { label: "시/군", value: first?.addr_si },
    { label: "구", value: first?.addr_gu },
    { label: "동/읍/면", value: first?.addr_dong },
    { label: "리", value: first?.addr_li },
  ];
  const locationName = addrFields
    .map((f) => f.value)
    .filter(Boolean)
    .join(" ");

  // 여유 컬럼은 잔여 수치(kW) 기준으로 정렬한다 — 문자열 "여유/없음"은
  // 정렬해도 의미가 없기 때문.
  const remaining = (r: KepcoDataRow, kind: "subst" | "mtr" | "dl"): number => {
    if (kind === "subst") return (r.subst_capa ?? 0) - (r.subst_pwr ?? 0);
    if (kind === "mtr") return (r.mtr_capa ?? 0) - (r.mtr_pwr ?? 0);
    return (r.dl_capa ?? 0) - (r.dl_pwr ?? 0);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = rows;
    if (q) {
      arr = arr.filter(
        (it) =>
          (it.addr_jibun ?? "").toLowerCase().includes(q) ||
          (it.subst_nm ?? "").toLowerCase().includes(q) ||
          (it.dl_nm ?? "").toLowerCase().includes(q) ||
          String(it.mtr_no ?? "").includes(q)
      );
    }
    const sorted = [...arr].sort((a, b) => {
      // 수치형 잔여 컬럼은 숫자 비교
      if (sortKey === "vol_subst" || sortKey === "vol_mtr" || sortKey === "vol_dl") {
        const kind =
          sortKey === "vol_subst" ? "subst" : sortKey === "vol_mtr" ? "mtr" : "dl";
        const an = remaining(a, kind);
        const bn = remaining(b, kind);
        return sortDir === "asc" ? an - bn : bn - an;
      }
      // 번지는 본번 숫자 우선
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      if (sortKey === "addr_jibun") {
        const an = parseInt(av, 10);
        const bn = parseInt(bv, 10);
        if (!isNaN(an) && !isNaN(bn) && an !== bn) {
          return sortDir === "asc" ? an - bn : bn - an;
        }
      }
      const cmp = av.localeCompare(bv, "ko", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 md:p-4">
      <div className="bg-white rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-4xl h-[90vh] md:max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 mb-0.5">상세 목록</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {addrFields
                .filter((f) => f.value)
                .map((f) => (
                  <div key={f.label} className="flex items-baseline gap-1">
                    <span className="text-[10px] text-gray-400">{f.label}</span>
                    <span className={`text-sm font-semibold ${
                      f.value?.includes("기타지역")
                        ? "text-gray-400 font-normal"
                        : "text-gray-900"
                    }`}>
                      {f.value}
                    </span>
                  </div>
                ))}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {viewMode === "table"
                ? `${filtered.length.toLocaleString()}건${
                    search ? ` (전체 ${rows.length.toLocaleString()}건 중 검색)` : ""
                  }`
                : `전체 ${rows.length.toLocaleString()}건`}
            </div>
          </div>

          {/* 보기 모드 전환 + 닫기 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs"
              role="tablist"
              aria-label="보기 모드"
            >
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 transition-colors ${
                  viewMode === "table"
                    ? "bg-blue-500 text-white font-semibold"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                title="번지 단위 표 보기"
              >
                📋 일반
              </button>
              <button
                type="button"
                onClick={() => setViewMode("group")}
                className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${
                  viewMode === "group"
                    ? "bg-blue-500 text-white font-semibold"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                title="같은 시설끼리 묶어서 보기"
              >
                🗂 그룹
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-1"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        {/* 그룹 보기 모드 — flex 영역 안에 넣어 overflow가 부모 경계를 넘지 않도록 */}
        {viewMode === "group" && (
          <div className="flex flex-col flex-1 min-h-0">
            <LocationDetailGrouped rows={rows} onJibunPin={onJibunPin} />
          </div>
        )}

        {/* 일반 표 보기 모드 — flex 컨테이너로 감싸 페이지네이션이 밀려나지 않도록 */}
        {viewMode === "table" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-3 flex-shrink-0">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="번지, 변전소, 배전선로명 검색..."
                className="flex-1 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={expanded.size === rows.length ? collapseAll : expandAll}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-2 border border-blue-200 rounded-md bg-white hover:bg-blue-50 whitespace-nowrap"
              >
                {expanded.size === rows.length ? "모두 접기" : "모두 펼치기"}
              </button>
            </div>

            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-xs min-w-[640px]">
                {/*
                 * 2단 헤더 — 같은 시설에 속한 [이름 / 여유] 를 상단 그룹 헤더로
                 * 묶어서 한눈에 그룹핑을 보이게 한다.
                 */}
                <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                  {/* 1단: 시설 그룹 */}
                  <tr className="border-b border-gray-200">
                    <th className="w-8 px-2 py-2 bg-gray-100" rowSpan={2}></th>
                    <th className="px-3 py-2 bg-gray-100" rowSpan={2}>
                      <SortHeaderInline
                        label="번지"
                        col="addr_jibun"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={setSort}
                      />
                    </th>
                    <th
                      colSpan={2}
                      className="px-3 py-1.5 text-center text-[10px] font-bold text-blue-800 bg-blue-50 border-l border-r border-blue-200"
                    >
                      🏭 변전소
                    </th>
                    <th
                      colSpan={2}
                      className="px-3 py-1.5 text-center text-[10px] font-bold text-emerald-800 bg-emerald-50 border-l border-r border-emerald-200"
                    >
                      ⚡ 주변압기
                    </th>
                    <th
                      colSpan={2}
                      className="px-3 py-1.5 text-center text-[10px] font-bold text-amber-800 bg-amber-50 border-l border-r border-amber-200"
                    >
                      📡 배전선로
                    </th>
                  </tr>
                  {/* 2단: 세부 컬럼 */}
                  <tr className="border-b-2 border-gray-300">
                    <th className="px-3 py-2 text-left bg-blue-50/40 border-l border-blue-200">
                      <SortHeaderInline
                        label="이름"
                        col="subst_nm"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={setSort}
                      />
                    </th>
                    <th className="px-3 py-2 text-right bg-blue-50/40 border-r border-blue-200">
                      <SortHeaderInline
                        label="여유"
                        col="vol_subst"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={setSort}
                        align="right"
                      />
                    </th>
                    <th className="px-3 py-2 text-left bg-emerald-50/40 border-l border-emerald-200">
                      <SortHeaderInline
                        label="번호"
                        col="mtr_no"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={setSort}
                      />
                    </th>
                    <th className="px-3 py-2 text-right bg-emerald-50/40 border-r border-emerald-200">
                      <SortHeaderInline
                        label="여유"
                        col="vol_mtr"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={setSort}
                        align="right"
                      />
                    </th>
                    <th className="px-3 py-2 text-left bg-amber-50/40 border-l border-amber-200">
                      <SortHeaderInline
                        label="이름"
                        col="dl_nm"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={setSort}
                      />
                    </th>
                    <th className="px-3 py-2 text-right bg-amber-50/40 border-r border-amber-200">
                      <SortHeaderInline
                        label="여유"
                        col="vol_dl"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={setSort}
                        align="right"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                        결과 없음
                      </td>
                    </tr>
                  ) : (
                    pageItems.map((it, idx) => {
                      const isOpen = expanded.has(it.id);
                      return (
                        <FragmentRow
                          key={it.id}
                          it={it}
                          idx={idx}
                          isOpen={isOpen}
                          onToggle={() => toggleExpand(it.id)}
                          onJibunPin={onJibunPin}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between text-xs flex-shrink-0">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 rounded-md font-semibold border border-blue-500 bg-white text-blue-600
                             hover:bg-blue-500 hover:text-white transition-colors
                             disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400
                             disabled:hover:bg-gray-100 disabled:hover:text-gray-400 disabled:cursor-not-allowed"
                >
                  ← 이전
                </button>
                <span className="text-gray-700 font-medium">
                  <span className="text-blue-600 font-bold">{page + 1}</span>
                  {" / "}
                  {totalPages} 페이지 ({filtered.length.toLocaleString()}건)
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-md font-semibold border border-blue-500 bg-white text-blue-600
                             hover:bg-blue-500 hover:text-white transition-colors
                             disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400
                             disabled:hover:bg-gray-100 disabled:hover:text-gray-400 disabled:cursor-not-allowed"
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 정렬 버튼 — <th> 밖에서 인라인으로 쓰도록 (2단 헤더에서 th를 직접 만들기 때문).
 * 기존 SortHeader와 다르게 <th>를 포함하지 않는다.
 */
function SortHeaderInline({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <button
      onClick={() => onSort(col)}
      className={`inline-flex items-center gap-1 font-medium ${
        align === "right" ? "justify-end" : ""
      } ${active ? "text-blue-600" : "text-gray-600 hover:text-gray-900"}`}
    >
      {label}
      {active && (
        <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  );
}

/**
 * 잔여 용량 셀 — 기준-접수 차이를 부호 색상 글자로 표시.
 * 양수(여유) 파랑, 음수(초과) 빨강. kW/MW 자동 변환.
 * vol_xxx 플래그는 참조하지 않고 잔여 수치로만 상태 판단.
 */
function RemainingCell({
  base,
  received,
}: {
  base: number | null;
  received: number | null;
}) {
  const remaining = (base ?? 0) - (received ?? 0);
  const positive = remaining > 0;
  return (
    <span
      className={`text-xs font-semibold tabular-nums ${
        positive ? "text-blue-600" : remaining < 0 ? "text-red-600" : "text-gray-400"
      }`}
    >
      {formatRemaining(remaining)}
    </span>
  );
}

/** 한 행 + 펼친 상세 영역 */
function FragmentRow({
  it,
  idx,
  isOpen,
  onToggle,
  onJibunPin,
}: {
  it: KepcoDataRow;
  idx: number;
  isOpen: boolean;
  onToggle: () => void;
  onJibunPin?: (row: KepcoDataRow) => void;
}) {
  const zebraBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/60";

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer ${zebraBg} ${
          isOpen ? "bg-blue-50/60 hover:bg-blue-50/60" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-2 py-2.5 text-center">
          <span
            className={`inline-block text-gray-400 transition-transform ${
              isOpen ? "rotate-90 text-blue-600" : ""
            }`}
          >
            ▶
          </span>
        </td>
        <td className="px-3 py-2.5 font-semibold text-gray-900">
          {onJibunPin && it.addr_jibun ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJibunPin(it);
              }}
              className="text-blue-600 hover:text-blue-800 hover:underline"
              title="지도에서 이 지번 위치 보기"
            >
              📍 {it.addr_jibun}
            </button>
          ) : (
            it.addr_jibun || "-"
          )}
        </td>
        <td className="px-3 py-2.5 text-gray-700">{it.subst_nm}</td>
        <td className="px-3 py-2.5 text-right">
          <RemainingCell base={it.subst_capa} received={it.subst_pwr} />
        </td>
        <td className="px-3 py-2.5 text-gray-700">#{it.mtr_no}</td>
        <td className="px-3 py-2.5 text-right">
          <RemainingCell base={it.mtr_capa} received={it.mtr_pwr} />
        </td>
        <td className="px-3 py-2.5 text-gray-700">{it.dl_nm}</td>
        <td className="px-3 py-2.5 text-right">
          <RemainingCell base={it.dl_capa} received={it.dl_pwr} />
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b-2 border-blue-200">
          <td colSpan={8} className="px-6 py-4 bg-blue-50/30">
            <DetailContent it={it} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailContent({ it }: { it: KepcoDataRow }) {
  const fullAddrParts = [
    it.addr_do,
    it.addr_si,
    it.addr_gu,
    it.addr_dong,
    it.addr_li,
    it.addr_jibun,
  ].filter(Boolean) as string[];

  const hasStep =
    it.step1_cnt != null ||
    it.step2_cnt != null ||
    it.step3_cnt != null;

  return (
    <div className="space-y-3">
      {/* 전체 주소 — 펼친 행의 핵심 식별자이므로 옅은 파랑 배너로 살짝 강조 */}
      <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
        <span className="text-blue-500 flex-shrink-0">📍</span>
        <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide flex-shrink-0">
          전체 주소
        </span>
        <span className="font-semibold text-gray-900 truncate"><AddrLine parts={fullAddrParts} /></span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FacilityCard
          title="변전소"
          name={it.subst_nm ?? "-"}
          ok={it.vol_subst === "여유용량 있음"}
          base={it.subst_capa}
          received={it.subst_pwr}
          planned={it.g_subst_capa}
        />
        <FacilityCard
          title="주변압기"
          name={`#${it.mtr_no ?? "-"}`}
          ok={it.vol_mtr === "여유용량 있음"}
          base={it.mtr_capa}
          received={it.mtr_pwr}
          planned={it.g_mtr_capa}
        />
        <FacilityCard
          title="배전선로"
          name={it.dl_nm ?? "-"}
          ok={it.vol_dl === "여유용량 있음"}
          base={it.dl_capa}
          received={it.dl_pwr}
          planned={it.g_dl_capa}
        />
      </div>

      {hasStep && (
        <div className="bg-white border border-gray-200 rounded-md p-3">
          <div className="text-[11px] font-bold text-gray-700 mb-2">
            📋 접속 예정 단계
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <StepBlock label="접수" cnt={it.step1_cnt} pwr={it.step1_pwr} />
            <StepBlock label="공용망 보강" cnt={it.step2_cnt} pwr={it.step2_pwr} />
            <StepBlock label="접속 공사" cnt={it.step3_cnt} pwr={it.step3_pwr} />
          </div>
        </div>
      )}
    </div>
  );
}

// FacilityCard, StepBlock 은 ./FacilityCard 에서 import (재사용)
