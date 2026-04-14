"use client";

/**
 * 사용 안내 — 탭 기반 모달.
 *
 * 버튼 클릭 시 중앙 모달로 열림. 상단 가로 스크롤 탭 + 하단 콘텐츠 구조로
 * 데스크톱/모바일 동일하게 동작함.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { STATUS_RED, STATUS_BLUE } from "@/lib/markerColor";

type TabKey = "search" | "filter" | "compare" | "map";

const TABS: { key: TabKey; label: string }[] = [
  { key: "search", label: "주소 검색" },
  { key: "filter", label: "조건 검색" },
  { key: "compare", label: "변화 추적" },
  { key: "map", label: "지도 기능" },
];

export default function UserGuide() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<TabKey>("search");

  useEffect(() => { setMounted(true); }, []);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 hover:border-blue-300 active:bg-blue-200 transition-colors shadow-sm"
      >
        <span>📖 사용 안내</span>
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900">📖 사용 안내</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            {/* 탭 — 가로 스크롤 */}
            <div className="border-b border-gray-200 overflow-x-auto flex-shrink-0">
              <div className="flex min-w-max">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      tab === t.key
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 콘텐츠 */}
            <div className="overflow-y-auto flex-1 px-5 py-4 text-sm text-gray-700">
              {tab === "search" && <SearchTab />}
              {tab === "filter" && <FilterTab />}
              {tab === "compare" && <CompareTab />}
              {tab === "map" && <MapTab />}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** 공통 섹션 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="font-semibold text-gray-900 mb-1.5">{title}</div>
      <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
        {children}
      </ul>
    </div>
  );
}

function SearchTab() {
  return (
    <div>
      <p className="text-xs text-gray-500 pb-3 mb-3 border-b border-gray-100 leading-relaxed">
        지역명이나 지번으로 원하는 위치를 빠르게 찾는 기능.
      </p>
      <Section title="1. 검색어 입력">
        <li>검색창에 <b>시/군/구/동/리/지번</b>을 자유롭게 입력</li>
        <li>예시: &quot;순천시 해룡면&quot;, &quot;서울시 강남구&quot;, &quot;복산리 353-2&quot;</li>
        <li>입력하면 자동으로 결과 목록이 표시됨</li>
      </Section>
      <Section title="2. 결과 보기 — 리 단위 / 지번 단위">
        <li><b>리 단위</b> — 마을 목록이 건수와 함께 표시됨</li>
        <li><b>지번 단위</b> — 개별 지번이 시설 정보와 함께 표시됨</li>
        <li>탭을 눌러 원하는 단위로 전환 가능</li>
      </Section>
      <Section title="3. 결과 클릭 동작">
        <li><b>마을 클릭</b> — 해당 마을로 지도가 이동하고 상세 카드가 열림</li>
        <li><b>지번 클릭</b> — 지도에 핀이 찍히고 시설 정보가 펼쳐짐</li>
        <li>여러 지번을 연달아 클릭하면 여러 핀이 동시에 표시됨</li>
      </Section>
    </div>
  );
}

function FilterTab() {
  return (
    <div>
      <p className="text-xs text-gray-500 pb-3 mb-3 border-b border-gray-100 leading-relaxed">
        원하는 조건을 만족하는 지역만 골라보는 기능. <b className="text-gray-700">여유 용량이 있는 곳 찾기</b>에 유용함.
      </p>
      <Section title="1. 조건 설정">
        <li>시설별(변전소/주변압기/배전선로)로 <b>여유 / 없음 / 전체</b> 선택</li>
        <li>세 시설 모두 조합 가능 <span className="text-gray-400">(예: 변전소 여유 + 배전선로 여유)</span></li>
        <li>조건에 맞는 마을 수가 실시간으로 표시됨</li>
      </Section>
      <Section title="2. 지역 필터링">
        <li>시/도, 시, 구/군, 동/면 드롭다운으로 범위를 좁힐 수 있음</li>
        <li>전국 단위부터 특정 동/면까지 원하는 만큼 필터 가능</li>
      </Section>
      <Section title="3. 결과 활용">
        <li>조건에 맞는 마을 목록을 <b>정렬</b>해서 확인 가능</li>
        <li>지도에도 조건에 맞는 마을만 강조되어 표시됨</li>
        <li>클릭하면 해당 마을로 이동</li>
      </Section>
    </div>
  );
}

function CompareTab() {
  return (
    <div>
      <p className="text-xs text-gray-500 pb-3 mb-3 border-b border-gray-100 leading-relaxed">
        두 시점을 비교해 <b className="text-gray-700">여유 상태가 달라진 지역</b>을 찾는 기능. 새로 생긴 여유 지역을 빠르게 발견 가능.
      </p>
      <Section title="1. 비교 시점 선택">
        <li><b>시점 A</b>, <b>시점 B</b> 두 날짜를 각각 선택</li>
        <li>시점 B를 오늘로 두면 현재 상태와 비교됨</li>
        <li>예: 시점 A = 1주 전, 시점 B = 오늘 → 일주일 사이 변화 확인</li>
      </Section>
      <Section title="2. 변화 유형 필터">
        <li><b>없음 → 있음</b>: 여유가 새로 생긴 곳 <span className="text-gray-400">(가장 중요!)</span></li>
        <li><b>있음 → 없음</b>: 여유가 사라진 곳</li>
        <li><b>혼합</b>: 시설마다 방향이 다른 곳</li>
      </Section>
      <Section title="3. 지번별 상세 보기">
        <li>마을을 클릭하면 지번별 변화 내역이 펼쳐짐</li>
        <li>특정 지번을 클릭하면 <b>해당 지번의 상세 용량 정보</b>가 열림</li>
        <li>어떤 시설이 어떻게 달라졌는지 바로 확인 가능</li>
      </Section>
    </div>
  );
}

function MapTab() {
  return (
    <div>
      <p className="text-xs text-gray-500 pb-3 mb-3 border-b border-gray-100 leading-relaxed">
        지도 조작과 부가 기능 안내.
      </p>

      <Section title="마커 보는 법">
        <li>마커는 <b>3줄 막대</b>로 변전소/주변압기/배전선로 상태 표시</li>
      </Section>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 flex items-start gap-4">
        <div className="flex items-center gap-1.5">
          <ExampleMarker />
          <div className="flex flex-col text-[10px] text-gray-600 leading-[10px] gap-[3px] mt-1">
            <span>변전소</span>
            <span>주변압기</span>
            <span>배전선로</span>
          </div>
        </div>
        <div className="text-[11px] text-gray-700 leading-snug border-l border-gray-200 pl-3">
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
          <div className="text-[10px] text-gray-400 mt-1.5">막대 길이 = 해당 비율</div>
        </div>
      </div>

      <Section title="지도 이동 / 확대">
        <li>지도를 <b>드래그</b>해서 이동, <b>마우스 휠 / 핀치 줌</b>으로 확대 축소</li>
        <li>우측 하단 +/- 버튼으로도 확대 축소 가능</li>
      </Section>

      <Section title="스카이뷰 / 지도 전환">
        <li>우측 상단 <b>[지도 / 스카이뷰]</b> 버튼으로 전환</li>
        <li>스카이뷰에서 도로명 표시 체크박스 사용 가능</li>
      </Section>

      <Section title="거리 재기">
        <li>지도 오른쪽 툴바의 자 아이콘 클릭 → 지도 위를 연속 클릭</li>
        <li>각 구간의 거리와 총 거리가 자동 계산됨</li>
        <li>우클릭 또는 다시 아이콘 클릭으로 종료</li>
      </Section>

      <Section title="내 위치 (GPS)">
        <li>지도 오른쪽 툴바의 위치 아이콘 클릭</li>
        <li>현재 위치로 지도가 이동하고 실시간 추적 가능</li>
        <li>모바일에서는 브라우저 위치 권한 허용 필요</li>
      </Section>

      <Section title="공유">
        <li>오른쪽 툴바의 공유 아이콘 클릭 → 현재 지도 상태 링크 복사</li>
        <li>중심 좌표, 줌 레벨, 조건 필터까지 함께 저장됨</li>
      </Section>

      <Section title="새로고침">
        <li>상단 <b>[새로고침]</b> 버튼으로 최신 데이터 수동 반영</li>
        <li>평소엔 자동 갱신되므로 굳이 누를 필요 없음</li>
      </Section>
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
      <path
        d={`M${W / 2 - 5} ${cardH} L${W / 2} ${H - 1} L${W / 2 + 5} ${cardH} Z`}
        fill="white"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
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
      <rect x="3" y="4" width={stripeW} height="6" rx="1" fill={STATUS_BLUE} />
      <rect x="3" y="4" width={r(75)} height="6" rx="1" fill={STATUS_RED} />
      <rect x="3" y="12" width={stripeW} height="6" rx="1" fill={STATUS_BLUE} />
      <rect x="3" y="20" width={stripeW} height="6" rx="1" fill={STATUS_BLUE} />
      <rect x="3" y="20" width={r(38)} height="6" rx="1" fill={STATUS_RED} />
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
