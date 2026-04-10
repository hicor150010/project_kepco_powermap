import CrawlManager from "@/components/admin/CrawlManager";

export const metadata = { title: "데이터 수집 — 관리자" };

export default function CrawlPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">데이터 수집</h2>
        <p className="text-sm text-gray-500 mt-1">
          KEPCO 사이트에서 배전선로 여유용량 데이터를 자동으로 가져옵니다.
          지역을 선택하고 시작하면 서버에서 자동 실행되며, 이전 데이터와 달라진 부분은 자동으로 변경 이력에 기록됩니다.
        </p>
      </div>

      <CrawlManager />
    </main>
  );
}
