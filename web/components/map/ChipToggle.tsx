"use client";

import { useState, useMemo } from "react";

/**
 * 칩 토글 — 가로 wrap + 스크롤 (옵션 많을 때)
 * - searchable=true면 상단에 검색 인풋
 * - 항목이 많으면 max-height + 스크롤
 */
interface Props {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  /** 검색 인풋 표시 여부 */
  searchable?: boolean;
  /** 최대 높이 (초과 시 스크롤). 기본: 자동 */
  maxHeight?: string;
}

export default function ChipToggle({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  maxHeight,
}: Props) {
  const [search, setSearch] = useState("");
  const isAll = selected.size === 0;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const clearAll = () => {
    onChange(new Set());
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-700">
          {label}
          {selected.size > 0 && (
            <span className="ml-1 text-blue-600 font-semibold">
              ({selected.size})
            </span>
          )}
        </label>
        {selected.size > 0 && (
          <button
            onClick={clearAll}
            className="text-[10px] text-blue-600 hover:text-blue-700"
          >
            전체 해제
          </button>
        )}
      </div>

      {searchable && options.length > 8 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${label} 검색...`}
          className="w-full px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded-md focus:outline-none focus:border-blue-400 mb-1.5"
        />
      )}

      <div
        className="flex flex-wrap gap-1 overflow-y-auto"
        style={{ maxHeight: maxHeight ?? "180px" }}
      >
        <button
          onClick={clearAll}
          className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors shrink-0 ${
            isAll
              ? "bg-gray-700 border-gray-700 text-white font-medium"
              : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          전체
        </button>
        {filtered.map((opt) => {
          const active = selected.has(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors shrink-0 ${
                active
                  ? "bg-blue-500 border-blue-500 text-white font-medium"
                  : "bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              {opt}
            </button>
          );
        })}
        {search && filtered.length === 0 && (
          <div className="text-[11px] text-gray-400 py-1 w-full text-center">
            검색 결과 없음
          </div>
        )}
      </div>
    </div>
  );
}
