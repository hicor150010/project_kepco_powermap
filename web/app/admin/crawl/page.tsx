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

        <details className="mt-3 group">
          <summary className="cursor-pointer text-sm text-orange-600 hover:text-orange-700 font-medium list-none flex items-center gap-1 select-none">
            <span className="inline-block transition-transform group-open:rotate-90">▶</span>
            사용 안내
          </summary>
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-3">
            <div>
              <div className="font-semibold text-gray-900 mb-1">1. 수집 시작</div>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                <li>시/도 → 시 → 구/군 → 동/면 → 리 순서로 선택 (하위는 선택 안 해도 됨)</li>
                <li>범위를 넓게 잡으면 오래 걸리니 소규모로 시작 권장</li>
                <li>시작 버튼을 누르면 GitHub Actions에서 자동 실행</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">2. 진행 상황</div>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                <li>하단 목록에서 현재 실행 중인 작업 확인</li>
                <li>처리 건수 / 발견 건수 / 오류 수가 실시간으로 갱신</li>
                <li>작업이 멈춘 것처럼 보이면 새로고침 버튼 클릭</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">3. 변경 이력 자동 기록</div>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                <li>이전 데이터와 달라진 지번은 자동으로 변경 이력에 저장</li>
                <li>지도의 "변화 추적" 탭에서 두 시점 간 변화를 확인 가능</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">4. 중단 / 취소</div>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                <li>실행 중 작업은 "중단" 버튼으로 안전하게 정지 (다음 체크포인트에서 종료)</li>
                <li>대기 중 작업은 바로 취소 가능</li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <CrawlManager />
    </main>
  );
}
