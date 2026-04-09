import UploadDropzone from "@/components/admin/UploadDropzone";

export const metadata = { title: "엑셀 업로드 — 관리자" };

export default function UploadPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">엑셀 업로드</h2>
        <p className="text-xs text-gray-500 mt-1">
          KEPCO 표준 양식의 엑셀 파일을 업로드하면 즉시 모든 사용자에게 반영됩니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <UploadDropzone />

        <div className="mt-6 pt-6 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
          <p>📌 KEPCO 표준 양식만 지원합니다. 다른 양식은 거부됩니다.</p>
          <p>📌 한 번에 여러 파일을 올릴 수 있고, 지역별로 나눠서도 올릴 수 있습니다.</p>
          <p>📌 같은 시설(주소+변전소+변압기+선로)은 최신 값으로 자동 갱신됩니다.</p>
          <p>📌 처리 결과는 업로드 후 화면에 표시됩니다.</p>
        </div>
      </div>
    </main>
  );
}
