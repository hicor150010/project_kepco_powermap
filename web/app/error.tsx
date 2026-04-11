"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center space-y-4">
        <div className="text-6xl font-bold text-red-500">500</div>
        <h1 className="text-xl font-semibold text-gray-900">
          오류가 발생했습니다
        </h1>
        <p className="text-gray-500 text-sm">
          일시적인 문제가 발생했어요. 잠시 후 다시 시도해 주세요.
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            지도로 돌아가기
          </a>
        </div>
      </div>
      <p className="mt-12 text-xs text-gray-400">PowerMap</p>
    </div>
  );
}
