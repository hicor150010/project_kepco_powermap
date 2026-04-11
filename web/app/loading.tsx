export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
        <span className="text-sm text-gray-500">불러오는 중...</span>
      </div>
    </div>
  );
}
