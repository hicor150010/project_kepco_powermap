import CrawlManager from "@/components/admin/CrawlManager";

export const metadata = { title: "크롤링 관리 — 관리자" };

export default function CrawlPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">크롤링 관리</h2>
        <p className="text-xs text-gray-500 mt-1">
          KEPCO 배전선로 여유용량 데이터를 자동으로 크롤링합니다. 지역을
          선택하고 시작하면 GitHub Actions에서 실행됩니다.
        </p>
      </div>

      <CrawlManager />
    </main>
  );
}
