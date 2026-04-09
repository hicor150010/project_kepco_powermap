"use client";

interface LoadingOverlayProps {
  step: string;            // 현재 단계 설명
  detail?: string;         // 상세 (예: "100/500건")
  progress?: number;       // 0~100
  hint?: string;           // 부가 안내
}

export default function LoadingOverlay({
  step,
  detail,
  progress,
  hint,
}: LoadingOverlayProps) {
  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="flex-1">
            <div className="font-medium text-gray-900">{step}</div>
            {detail && <div className="text-xs text-gray-500 mt-0.5">{detail}</div>}
          </div>
        </div>

        {progress !== undefined && (
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {hint && (
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">{hint}</p>
        )}
      </div>
    </div>
  );
}
