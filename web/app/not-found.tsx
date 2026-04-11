import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center space-y-4">
        <div className="text-6xl font-bold text-blue-600">404</div>
        <h1 className="text-xl font-semibold text-gray-900">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="text-gray-500 text-sm">
          요청하신 페이지가 존재하지 않거나 이동되었어요.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          지도로 돌아가기
        </Link>
      </div>
      <p className="mt-12 text-xs text-gray-400">PowerMap</p>
    </div>
  );
}
