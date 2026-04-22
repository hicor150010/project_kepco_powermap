"use client";

/**
 * 비교 기능 — 리팩토링 중 (2026-04-22).
 *
 * 기존 ref/changelog + 날짜 A/B 기반 비교 UI 는 전면 제거됨.
 * 신규: 사용자가 과거 시점에 다운받은 엑셀을 업로드 → 현재 DB 와 비교.
 * 관련 체크리스트: .claude/memory/project_refactor_checklist.md
 */

interface Props {
  // 기존 호환 — 엑셀 업로드 UI 로 교체 시 재활용 예정
  onSearchPick?: unknown;
  selectedAddr?: string | null;
  onMapFilter?: unknown;
  onClearMapFilter?: unknown;
  resetKey?: number;
}

export default function CompareFilterPanel(_props: Props) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-3xl mb-3">🛠</div>
      <div className="text-sm font-bold text-gray-800 mb-1.5">
        변화 추적 — 개편 중
      </div>
      <div className="text-[11px] text-gray-500 leading-relaxed max-w-[240px]">
        과거에 다운받은 엑셀을 올리면 현재 상태와 비교할 수 있게 바뀝니다.
        <br />
        조금만 기다려 주세요.
      </div>
    </div>
  );
}
