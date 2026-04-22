export const metadata = { title: "엑셀 업로드 — 관리자 (중단)" };

export default function UploadPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">엑셀 업로드 (중단)</h2>
        <p className="text-xs text-gray-500 mt-1">
          2026-04-22 부터 엑셀 업로드 기능이 비활성화되었습니다. 데이터 수집은
          크롤러(자동 수집)로만 이루어집니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-3 text-sm text-gray-700">
        <p>
          <b>대체 경로:</b> 관리자 &rarr; 데이터 수집 메뉴에서 전국/지역별 크롤링을
          수행합니다.
        </p>
        <p>
          <b>엑셀이 꼭 필요한 경우:</b> 관리자에게 직접 요청하세요. 코드는 보존
          되어 있어 필요 시 재활성화 가능합니다.
        </p>
      </div>
    </main>
  );
}
