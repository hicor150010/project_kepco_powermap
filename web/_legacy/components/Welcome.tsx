"use client";

interface WelcomeProps {
  onUploadClick: () => void;
}

export default function Welcome({ onUploadClick }: WelcomeProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 max-w-md mx-4 pointer-events-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            배전선로 여유용량 지도
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            한전에서 받은 엑셀 파일을 업로드하면<br />
            지역별 여유용량 상태를 지도에서 한눈에 볼 수 있습니다.
          </p>
        </div>

        <button
          onClick={onUploadClick}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
        >
          엑셀 파일 업로드하기
        </button>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2">이렇게 표시됩니다</p>
          <div className="space-y-1.5 text-xs text-gray-600">
            <LegendItem color="#3B82F6" label="여유 충분 (모두 가능)" />
            <LegendItem color="#22C55E" label="배전선로만 부족" />
            <LegendItem color="#EAB308" label="주변압기·배전선로 부족" />
            <LegendItem color="#EF4444" label="변전소 여유 없음 (불가)" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span>{label}</span>
    </div>
  );
}
