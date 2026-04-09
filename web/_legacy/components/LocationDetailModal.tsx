"use client";

import { useMemo, useState } from "react";
import type { LocationData, LocationGroup } from "@/lib/types";

interface Props {
  group: LocationGroup;
  onClose: () => void;
}

type SortKey = "addr_jibun" | "subst_nm" | "mtr_no" | "dl_nm";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

export default function LocationDetailModal({ group, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("addr_jibun");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const first = group.items[0];
  const locationName = `${first.addr_do} ${first.addr_gu} ${first.addr_dong} ${first.addr_li}`.trim();

  // 검색 + 정렬
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = group.items;
    if (q) {
      arr = arr.filter(
        (it) =>
          it.addr_jibun.toLowerCase().includes(q) ||
          it.subst_nm.toLowerCase().includes(q) ||
          it.dl_nm.toLowerCase().includes(q) ||
          String(it.mtr_no).includes(q)
      );
    }
    const sorted = [...arr].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      // 번지: 숫자 우선 정렬
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
  }, [group.items, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 mb-0.5">상세 목록</div>
            <div className="font-semibold text-base text-gray-900 truncate">
              {locationName}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {filtered.length.toLocaleString()}건
              {search && ` (전체 ${group.items.length.toLocaleString()}건 중 검색)`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 검색 */}
        <div className="px-5 py-3 border-b bg-gray-50">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="번지, 변전소, 배전선로명 검색..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* 테이블 */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="border-b border-gray-200">
                <SortHeader label="번지" col="addr_jibun" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <SortHeader label="변전소" col="subst_nm" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <th className="px-3 py-2 text-left text-gray-600 font-medium">변전소 여유</th>
                <SortHeader label="주변압기" col="mtr_no" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <th className="px-3 py-2 text-left text-gray-600 font-medium">변압기 여유</th>
                <SortHeader label="배전선로" col="dl_nm" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <th className="px-3 py-2 text-left text-gray-600 font-medium">선로 여유</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    결과 없음
                  </td>
                </tr>
              ) : (
                pageItems.map((it, i) => (
                  <tr key={`${it.addr_jibun}-${it.subst_nm}-${it.mtr_no}-${it.dl_nm}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{it.addr_jibun || "-"}</td>
                    <td className="px-3 py-2 text-gray-700">{it.subst_nm}</td>
                    <td className="px-3 py-2"><StatusBadge ok={it.vol_subst === "여유용량 있음"} /></td>
                    <td className="px-3 py-2 text-gray-700">#{it.mtr_no}</td>
                    <td className="px-3 py-2"><StatusBadge ok={it.vol_mtr === "여유용량 있음"} /></td>
                    <td className="px-3 py-2 text-gray-700">{it.dl_nm}</td>
                    <td className="px-3 py-2"><StatusBadge ok={it.vol_dl === "여유용량 있음"} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between text-xs">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← 이전
            </button>
            <span className="text-gray-600">
              {page + 1} / {totalPages} 페이지 ({filtered.length.toLocaleString()}건)
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              다음 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="px-3 py-2 text-left">
      <button
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 font-medium ${
          active ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
        }`}
      >
        {label}
        {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
        ok ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
      }`}
    >
      {ok ? "여유" : "없음"}
    </span>
  );
}
