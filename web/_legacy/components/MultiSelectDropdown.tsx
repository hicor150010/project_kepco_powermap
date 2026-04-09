"use client";

import { useState, useRef, useEffect } from "react";

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  searchable?: boolean;
}

export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filteredOptions = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const allSelected = selected.size === 0 || selected.size === options.length;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const selectAll = () => {
    onChange(new Set());
  };

  const summary =
    selected.size === 0
      ? "전체"
      : selected.size === 1
        ? Array.from(selected)[0]
        : `${selected.size}개 선택`;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-700">{label}</label>
        {selected.size > 0 && (
          <button
            onClick={selectAll}
            className="text-[10px] text-blue-600 hover:text-blue-700"
          >
            전체
          </button>
        )}
      </div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-3 py-2 text-sm border rounded-md bg-white text-left flex items-center justify-between transition-colors ${
          allSelected
            ? "border-gray-300 text-gray-600"
            : "border-blue-400 text-gray-900 bg-blue-50"
        }`}
      >
        <span className="truncate">{summary}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-1 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색..."
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                결과 없음
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selected.has(opt) || selected.size === 0;
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt)}
                      className="w-3.5 h-3.5 rounded"
                    />
                    <span className="truncate flex-1">{opt}</span>
                  </label>
                );
              })
            )}
          </div>
          {selected.size > 0 && (
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={selectAll}
                className="w-full text-xs text-blue-600 hover:text-blue-700 py-1"
              >
                선택 해제
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
