"use client";

/**
 * 지도 우상단 플로팅 도구 패널.
 *
 * - 단일 책임: "어떤 도구를 활성화할지" 선택만 한다.
 *   실제 도구 동작은 각 도구 컴포넌트(DistanceTool, TopRemainingList 등)가 담당.
 * - 향후 주소 검색, 현재 위치 등도 같은 패널에 버튼 한 줄로 추가하면 된다.
 */

interface Props {
  /** 거리재기 모드 활성 여부 */
  measureActive: boolean;
  /** 거리재기 토글 */
  onToggleMeasure: () => void;
  /** 유망 부지 TOP 패널 활성 여부 */
  topListActive: boolean;
  /** 유망 부지 TOP 패널 토글 */
  onToggleTopList: () => void;
}

export default function MapToolbar({
  measureActive,
  onToggleMeasure,
  topListActive,
  onToggleTopList,
}: Props) {
  return (
    <div
      className="absolute top-4 right-4 z-10 flex flex-col gap-1.5
                 bg-white rounded-lg shadow-md border border-gray-200 p-1.5"
    >
      {/* 유망 부지 TOP 토글 */}
      <button
        type="button"
        onClick={onToggleTopList}
        title={topListActive ? "유망 부지 닫기" : "유망 부지 TOP 보기"}
        className={`w-9 h-9 rounded-md flex items-center justify-center text-base
                   transition-colors ${
                     topListActive
                       ? "bg-amber-400 text-amber-950 hover:bg-amber-500"
                       : "bg-white text-gray-700 hover:bg-gray-100"
                   }`}
      >
        🌞
      </button>

      {/* 거리재기 토글 */}
      <button
        type="button"
        onClick={onToggleMeasure}
        title={measureActive ? "거리재기 종료" : "거리재기"}
        className={`w-9 h-9 rounded-md flex items-center justify-center text-base
                   transition-colors ${
                     measureActive
                       ? "bg-blue-500 text-white hover:bg-blue-600"
                       : "bg-white text-gray-700 hover:bg-gray-100"
                   }`}
      >
        📏
      </button>
    </div>
  );
}
