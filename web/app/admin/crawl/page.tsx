import CrawlManager from "@/components/admin/CrawlManager";

export const metadata = { title: "데이터 수집 — 관리자" };

export default function CrawlPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-bold text-gray-900">데이터 수집</h2>
        <details className="group">
          <summary className="cursor-pointer text-sm text-orange-600 hover:text-orange-700 font-medium list-none flex items-center gap-1 select-none">
            <span className="inline-block transition-transform group-open:rotate-90">▶</span>
            사용 안내
          </summary>
          <div className="absolute mt-2 z-10 bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-4 shadow-lg max-w-2xl">
            <p className="text-xs text-gray-500 pb-2 border-b border-gray-100 leading-relaxed">
              한전 홈페이지에서 <b className="text-gray-700">배전선로 여유용량 정보</b>를 자동으로 가져와 지도에 반영함. 전날과 달라진 부분은 <b className="text-gray-700">&quot;변화 추적&quot;</b>에서 바로 확인 가능함.
            </p>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">1. 수집 시작하기</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>알고 싶은 지역을 <b>시/도 → 시 → 구/군 → 동/면 → 리</b> 순으로 선택</li>
                <li>하위 항목은 비워두면 상위 지역 전체가 수집됨 <span className="text-gray-400">(예: 시까지만 선택 = 그 시 전체)</span></li>
                <li>너무 큰 범위는 오래 걸리므로 <b>작은 지역부터</b> 시작 권장</li>
                <li><b>[수집 시작]</b> 버튼을 누르면 자동 실행 — 창을 닫아도 계속 진행됨</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">2. 수집기 3개 — 동시에 여러 지역 수집</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li><b>수집기 1, 2, 3</b>을 각각 사용해 서로 다른 지역을 <b>동시에 수집</b> 가능</li>
                <li>각 수집기는 독립적으로 실행되므로 한 곳이 진행 중이어도 다른 수집기로 다른 지역 시작 가능</li>
                <li>단, 같은 수집기는 한 번에 하나의 작업만 실행 가능</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">3. 1회 수집 vs 반복 수집</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li><b>1회 수집</b> — 선택한 지역을 한 번만 수집하고 종료</li>
                <li><b>반복 수집</b> — 선택한 지역을 반복해서 자동 수집 <span className="text-gray-400">(항상 최신 상태 유지)</span></li>
                <li>반복 횟수를 지정하거나 비워두면 무제한 반복 — 수동으로 중단할 때까지 계속됨</li>
                <li className="text-gray-500">장시간 수집 시 5시간 단위로 자동 재시작되므로 이력에 여러 건으로 나뉘어 표시됨 — 정상 동작이므로 신경 쓸 필요 없음</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">4. 진행 상황 확인</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>화면 아래에서 현재 수집 중인 작업이 <b>실시간으로</b> 표시됨</li>
                <li>수집 건수, 처리된 지번 수 등이 자동 갱신됨</li>
                <li>오래 멈춰있어 보이면 <b>새로고침 버튼</b> 클릭</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">5. 이어서 추출 — 중단된 작업 재개</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>수집이 중단되거나 타임아웃된 경우, <b>작업 이력에서 해당 작업을 펼치면</b> [이어서 추출] 버튼이 표시됨</li>
                <li>처음부터가 아니라 <b>중단된 지점부터 이어서</b> 수집되므로 시간 절약 가능</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">6. 변화 자동 기록</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>수집할 때마다 이전과 달라진 지번 <span className="text-gray-400">(여유 → 없음, 없음 → 여유)</span>이 자동 저장됨</li>
                <li>지도 화면의 <b>&quot;변화 추적&quot;</b> 탭에서 두 날짜를 비교해 변화 확인 가능</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">7. 수집 중단하기</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>실행 중인 작업 옆 <b>[중단]</b> 버튼으로 안전하게 정지</li>
                <li>중단해도 이미 수집된 데이터는 <b>그대로 저장됨</b></li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <CrawlManager />
    </main>
  );
}
