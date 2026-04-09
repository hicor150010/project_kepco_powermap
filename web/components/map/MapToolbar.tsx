"use client";

/**
 * 지도 우상단 플로팅 도구 패널.
 *
 * 카카오맵 네이티브 UI와 유사한 배치:
 *   1) 지도/스카이뷰 탭 토글
 *   2) 오버레이 옵션 (스카이뷰일 때)
 *   3) 도구 버튼 (유망 부지, 거리재기)
 *   4) 줌 +/- 버튼
 *
 * 모든 요소를 하나의 컬럼으로 배치해 SDK 기본 컨트롤과의 중첩을 방지한다.
 */

type MapType = "roadmap" | "skyview" | "hybrid";

interface Props {
  measureActive: boolean;
  onToggleMeasure: () => void;
  topListActive: boolean;
  onToggleTopList: () => void;
  mapType: MapType;
  onMapTypeChange: (type: MapType) => void;
  /** 줌 인/아웃 콜백 */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export default function MapToolbar({
  measureActive,
  onToggleMeasure,
  topListActive,
  onToggleTopList,
  mapType,
  onMapTypeChange,
  onZoomIn,
  onZoomOut,
}: Props) {
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
      {/* ── 1. 지도/스카이뷰 탭 ── */}
      <div className="flex rounded overflow-hidden shadow border border-gray-300 text-xs font-medium leading-none">
        <button
          type="button"
          onClick={() => onMapTypeChange("roadmap")}
          className={`px-3 py-[7px] transition-colors ${
            mapType === "roadmap"
              ? "bg-white text-gray-900 font-bold"
              : "bg-gray-100 text-gray-500 hover:bg-gray-50"
          }`}
        >
          지도
        </button>
        <button
          type="button"
          onClick={() =>
            onMapTypeChange(mapType === "roadmap" ? "hybrid" : "roadmap")
          }
          className={`px-3 py-[7px] border-l border-gray-300 transition-colors ${
            mapType !== "roadmap"
              ? "bg-white text-gray-900 font-bold"
              : "bg-gray-100 text-gray-500 hover:bg-gray-50"
          }`}
        >
          스카이뷰
        </button>
      </div>

      {/* ── 2. 스카이뷰 오버레이 옵션 ── */}
      {mapType !== "roadmap" && (
        <label
          className="flex items-center gap-1.5 bg-white/95 backdrop-blur
                     rounded shadow-sm border border-gray-200 px-2.5 py-1
                     text-[11px] text-gray-700 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={mapType === "hybrid"}
            onChange={(e) =>
              onMapTypeChange(e.target.checked ? "hybrid" : "skyview")
            }
            className="accent-blue-500 w-3.5 h-3.5"
          />
          도로·지명 표시
        </label>
      )}

      {/* ── 3. 도구 버튼 (유망 부지 / 거리재기) ── */}
      <div className="flex flex-col gap-px bg-white rounded-lg shadow border border-gray-200 p-1">
        <button
          type="button"
          onClick={onToggleTopList}
          title={topListActive ? "유망 부지 닫기" : "유망 부지 TOP 보기"}
          className={`w-8 h-8 rounded flex items-center justify-center text-sm
                     transition-colors ${
                       topListActive
                         ? "bg-amber-400 text-amber-950 hover:bg-amber-500"
                         : "bg-white text-gray-700 hover:bg-gray-100"
                     }`}
        >
          🌞
        </button>
        <button
          type="button"
          onClick={onToggleMeasure}
          title={measureActive ? "거리재기 종료" : "거리재기"}
          className={`w-8 h-8 rounded flex items-center justify-center text-sm
                     transition-colors ${
                       measureActive
                         ? "bg-blue-500 text-white hover:bg-blue-600"
                         : "bg-white text-gray-700 hover:bg-gray-100"
                     }`}
        >
          📏
        </button>
      </div>

      {/* ── 4. 줌 +/- ── */}
      <div className="flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={onZoomIn}
          title="확대"
          className="w-8 h-8 flex items-center justify-center text-gray-600
                     hover:bg-gray-100 transition-colors text-base font-bold leading-none"
        >
          +
        </button>
        <div className="h-px bg-gray-200" />
        <button
          type="button"
          onClick={onZoomOut}
          title="축소"
          className="w-8 h-8 flex items-center justify-center text-gray-600
                     hover:bg-gray-100 transition-colors text-base font-bold leading-none"
        >
          −
        </button>
      </div>
    </div>
  );
}
