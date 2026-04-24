"use client";

import { useMemo } from "react";

/** 지역 필터에 필요한 최소 필드 */
export interface RegionRow {
  // optional — KepcoDataRow 의 enrichment 필드(string|null|undefined)와도 호환되도록.
  // RegionFilter 내부는 `!= null` 비교라 undefined 도 안전 처리.
  addr_do?: string | null;
  addr_si?: string | null;
  addr_gu?: string | null;
  addr_dong?: string | null;
}

export interface RegionSelection {
  addr_do: string;
  addr_si: string;
  addr_gu: string;
  addr_dong: string;
}

const EMPTY: RegionSelection = { addr_do: "", addr_si: "", addr_gu: "", addr_dong: "" };

interface Props {
  rows: RegionRow[];
  value: RegionSelection;
  onChange: (v: RegionSelection) => void;
}

/** 지역 필터 — 드롭다운 4개 한 줄 (카스케이딩) */
export default function RegionFilter({ rows, value, onChange }: Props) {
  const doOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.addr_do && set.add(r.addr_do));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);

  const siOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (value.addr_do && r.addr_do !== value.addr_do) return;
      if (r.addr_si) set.add(r.addr_si);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows, value.addr_do]);

  const guOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (value.addr_do && r.addr_do !== value.addr_do) return;
      if (value.addr_si && r.addr_si !== value.addr_si) return;
      if (r.addr_gu) set.add(r.addr_gu);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows, value.addr_do, value.addr_si]);

  const dongOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (value.addr_do && r.addr_do !== value.addr_do) return;
      if (value.addr_si && r.addr_si !== value.addr_si) return;
      if (value.addr_gu && r.addr_gu !== value.addr_gu) return;
      if (r.addr_dong) set.add(r.addr_dong);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows, value.addr_do, value.addr_si, value.addr_gu]);

  const selectCls = "border border-gray-300 rounded px-1 py-1 text-[11px] text-gray-900 bg-white min-w-0 flex-1 truncate";

  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
      {/* 시/도 */}
      <select
        value={value.addr_do}
        onChange={(e) => onChange({ ...EMPTY, addr_do: e.target.value })}
        className={selectCls}
      >
        <option value="">전체 ▾</option>
        {doOptions.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>

      {/* 시 */}
      <select
        value={value.addr_si}
        onChange={(e) => onChange({ ...value, addr_si: e.target.value, addr_gu: "", addr_dong: "" })}
        className={selectCls}
        disabled={siOptions.length === 0}
      >
        <option value="">전체 ▾</option>
        {siOptions.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>

      {/* 구/군 */}
      <select
        value={value.addr_gu}
        onChange={(e) => onChange({ ...value, addr_gu: e.target.value, addr_dong: "" })}
        className={selectCls}
        disabled={guOptions.length === 0}
      >
        <option value="">전체 ▾</option>
        {guOptions.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>

      {/* 동/면 */}
      <select
        value={value.addr_dong}
        onChange={(e) => onChange({ ...value, addr_dong: e.target.value })}
        className={selectCls}
        disabled={dongOptions.length === 0}
      >
        <option value="">전체 ▾</option>
        {dongOptions.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}

/** 지역 필터 적용 유틸 */
export function applyRegionFilter<T extends RegionRow>(rows: T[], sel: RegionSelection): T[] {
  return rows.filter((r) => {
    if (sel.addr_do && r.addr_do !== sel.addr_do) return false;
    if (sel.addr_si && r.addr_si !== sel.addr_si) return false;
    if (sel.addr_gu && r.addr_gu !== sel.addr_gu) return false;
    if (sel.addr_dong && r.addr_dong !== sel.addr_dong) return false;
    return true;
  });
}

export const EMPTY_REGION: RegionSelection = { addr_do: "", addr_si: "", addr_gu: "", addr_dong: "" };
