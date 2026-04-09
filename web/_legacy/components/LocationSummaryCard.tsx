"use client";

import { useMemo } from "react";
import type { LocationGroup } from "@/lib/types";
import { summarizeLocation, formatPower, type FacilityStat } from "@/lib/summarize";

type FacilityKind = "subst" | "mtr" | "dl";

interface Props {
  group: LocationGroup;
  onShowDetail: () => void;
  onClose: () => void;
  /** 시설 행 클릭 시 컬럼 필터에 적용 */
  onApplyFacilityFilter?: (kind: FacilityKind, name: string) => void;
}

export default function LocationSummaryCard({
  group,
  onShowDetail,
  onClose,
  onApplyFacilityFilter,
}: Props) {
  const summary = useMemo(() => summarizeLocation(group.items), [group]);
  const first = group.items[0];
  const locationName = `${first.addr_do} ${first.addr_gu} ${first.addr_dong} ${first.addr_li}`.trim();

  return (
    <div className="absolute left-4 bottom-4 w-[420px] max-w-[calc(100%-32px)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-10 flex flex-col max-h-[calc(100vh-120px)]">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-start justify-between gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-gray-500 mb-0.5">이 마을 요약</div>
          <div className="font-semibold text-sm text-gray-900 truncate">
            {locationName}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            총 <span className="font-bold text-gray-900">{summary.total.toLocaleString()}건</span>의
            데이터
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      {/* 요약 본문 (스크롤) */}
      <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
        <FacilitySection
          title="변전소"
          stats={summary.substations}
          total={summary.total}
          noCapPct={summary.substNoCapPct}
          kind="subst"
          showStep={summary.hasStepData}
          onApplyFilter={onApplyFacilityFilter}
        />
        <FacilitySection
          title="주변압기"
          stats={summary.transformers}
          total={summary.total}
          noCapPct={summary.mtrNoCapPct}
          kind="mtr"
          showStep={summary.hasStepData}
          onApplyFilter={onApplyFacilityFilter}
        />
        <FacilitySection
          title="배전선로"
          stats={summary.distributionLines}
          total={summary.total}
          noCapPct={summary.dlNoCapPct}
          kind="dl"
          showStep={summary.hasStepData}
          onApplyFilter={onApplyFacilityFilter}
        />
      </div>

      {/* 상세 보기 버튼 */}
      <div className="px-4 py-3 border-t bg-gray-50 flex-shrink-0">
        <button
          onClick={onShowDetail}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          상세 목록 보기 ({summary.total.toLocaleString()}건)
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function FacilitySection({
  title,
  stats,
  total,
  noCapPct,
  kind,
  showStep,
  onApplyFilter,
}: {
  title: string;
  stats: FacilityStat[];
  total: number;
  noCapPct: number;
  kind: FacilityKind;
  showStep: boolean;
  onApplyFilter?: (kind: FacilityKind, name: string) => void;
}) {
  const TOP = 5;
  const top = stats.slice(0, TOP);
  const rest = stats.slice(TOP);
  const restCount = rest.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-gray-700">{title}</div>
        <div className="text-[10px] text-gray-500">
          여유 없음{" "}
          <span className={`font-bold ${noCapPct >= 50 ? "text-red-600" : "text-gray-700"}`}>
            {noCapPct}%
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {top.map((s) => (
          <FacilityRow
            key={s.name}
            stat={s}
            total={total}
            kind={kind}
            showStep={showStep}
            onApplyFilter={onApplyFilter}
          />
        ))}
        {rest.length > 0 && (
          <div className="text-[10px] text-gray-400 pl-1 pt-0.5">
            그 외 {rest.length}개 ({restCount.toLocaleString()}건)
          </div>
        )}
      </div>
    </div>
  );
}

function FacilityRow({
  stat,
  total,
  kind,
  showStep,
  onApplyFilter,
}: {
  stat: FacilityStat;
  total: number;
  kind: FacilityKind;
  showStep: boolean;
  onApplyFilter?: (kind: FacilityKind, name: string) => void;
}) {
  const pct = total > 0 ? Math.round((stat.count / total) * 100) : 0;
  const ok = stat.hasCapacity;
  const remainingPositive = stat.remaining > 0;

  // 시설명에서 prefix(#) 제거 → 필터 적용용
  const filterName = stat.name.startsWith("#") ? stat.name.slice(1) : stat.name;

  const clickable = !!onApplyFilter;

  return (
    <div
      className={`p-2 rounded-md border ${
        clickable
          ? "border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition-colors"
          : "border-gray-200"
      }`}
      onClick={clickable ? () => onApplyFilter(kind, filterName) : undefined}
      title={clickable ? "클릭하면 이 시설로 필터를 적용해요" : undefined}
    >
      {/* 1줄: 이름 + 상태 + 건수 */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            ok ? "bg-blue-500" : "bg-red-500"
          }`}
        />
        <span className="flex-1 truncate font-medium text-gray-900">{stat.name}</span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
            ok ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
          }`}
        >
          {ok ? "여유" : "없음"}
        </span>
        <span className="text-gray-900 font-medium tabular-nums w-12 text-right">
          {stat.count.toLocaleString()}건
        </span>
        <span className="text-gray-400 tabular-nums w-9 text-right">{pct}%</span>
      </div>

      {/* 2줄: 용량 수치 */}
      {stat.baseCapacity > 0 && (
        <div className="mt-1.5 pl-3.5 grid grid-cols-3 gap-1 text-[10px] text-gray-500">
          <div>
            <div className="text-gray-400">기준</div>
            <div className="text-gray-700 tabular-nums">
              {formatPower(stat.baseCapacity)}
            </div>
          </div>
          <div>
            <div className="text-gray-400">접수</div>
            <div className="text-gray-700 tabular-nums">
              {formatPower(stat.receivedCapacity)}
            </div>
          </div>
          <div>
            <div className="text-gray-400">계획</div>
            <div className="text-gray-700 tabular-nums">
              {formatPower(stat.plannedCapacity)}
            </div>
          </div>
        </div>
      )}

      {/* 3줄: 잔여 여유분 강조 */}
      {stat.baseCapacity > 0 && (
        <div className="mt-1 pl-3.5">
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              remainingPositive
                ? "bg-blue-100 text-blue-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {remainingPositive ? "여유 " : "초과 "}
            {formatPower(Math.abs(stat.remaining))}
          </span>
        </div>
      )}

      {/* 4줄: STEP 데이터 (있을 때만) */}
      {showStep && stat.step1 && (
        <div className="mt-1.5 pl-3.5 text-[10px] text-gray-500">
          <div className="text-gray-400 mb-0.5">접속 예정</div>
          <div className="grid grid-cols-3 gap-1">
            <StepCell label="접수" cnt={stat.step1.cnt} pwr={stat.step1.pwr} />
            <StepCell label="공용망" cnt={stat.step2!.cnt} pwr={stat.step2!.pwr} />
            <StepCell label="접속" cnt={stat.step3!.cnt} pwr={stat.step3!.pwr} />
          </div>
        </div>
      )}
    </div>
  );
}

function StepCell({ label, cnt, pwr }: { label: string; cnt: number; pwr: number }) {
  return (
    <div>
      <div className="text-gray-400">{label}</div>
      <div className="text-gray-700 tabular-nums">
        {cnt}건 {pwr > 0 && <span className="text-gray-500">({formatPower(pwr)})</span>}
      </div>
    </div>
  );
}
