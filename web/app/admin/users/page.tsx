import { getCurrentUser } from "@/lib/auth";
import UserManager from "@/components/admin/UserManager";

export const metadata = { title: "계정 관리 — 관리자" };

export default async function UsersPage() {
  const me = await getCurrentUser();
  // layout에서 이미 인증/권한 체크됨, 본인 ID만 전달
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-bold text-gray-900">계정 관리</h2>
        <details className="group">
          <summary className="cursor-pointer text-sm text-orange-600 hover:text-orange-700 font-medium list-none flex items-center gap-1 select-none">
            <span className="inline-block transition-transform group-open:rotate-90">▶</span>
            사용 안내
          </summary>
          <div className="absolute mt-2 z-10 bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-4 shadow-lg max-w-2xl">
            <p className="text-xs text-gray-500 pb-2 border-b border-gray-100 leading-relaxed">
              사용자 계정을 직접 만들고 권한을 관리함. 이 서비스는 회원가입 기능이 없으므로, 새로운 사용자가 이용하려면 관리자가 여기서 <b className="text-gray-700">직접 계정을 만들어 전달</b>해야 함.
            </p>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">1. 새 계정 만들기</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>화면 우측 상단의 <b>[+ 계정 추가]</b> 버튼 클릭</li>
                <li>입력 항목:
                  <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                    <li><b>아이디</b> — 로그인 시 사용할 ID <span className="text-gray-400">(예: kim_ss)</span></li>
                    <li><b>비밀번호</b> — 6자 이상 권장</li>
                    <li><b>이름</b> — 표시용 이름 <span className="text-gray-400">(선택)</span></li>
                    <li><b>권한</b> — 관리자 / 일반 사용자 중 선택</li>
                  </ul>
                </li>
                <li>생성 완료 후 해당 아이디와 비밀번호를 사용자에게 전달</li>
                <li className="text-gray-500">비밀번호는 관리자도 다시 볼 수 없으므로 생성 시점에 반드시 기록해 둘 것</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">2. 권한 구분 — 관리자 vs 일반 사용자</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li><b>관리자</b>
                  <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                    <li>지도 화면 전체 기능 사용</li>
                    <li>데이터 수집 시작/중단</li>
                    <li>계정 관리 <span className="text-gray-400">(본 페이지)</span></li>
                  </ul>
                </li>
                <li><b>일반 사용자</b>
                  <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                    <li>지도 화면 조회, 검색, 비교 기능만 사용</li>
                    <li>관리자 메뉴 접근 불가</li>
                  </ul>
                </li>
                <li className="text-gray-500">일반적인 사용자는 &quot;일반 사용자&quot;로 만드는 것을 권장. 실수로 데이터가 수정되는 것을 방지함</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">3. 권한 변경</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>계정 목록 우측의 <b>[권한 변경]</b> 버튼 클릭 시 관리자 ↔ 일반이 전환됨</li>
                <li>본인 계정을 일반으로 변경하는 것은 막혀있음 <span className="text-gray-400">(관리자가 사라지는 사고 방지)</span></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">4. 비밀번호 초기화</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>사용자가 비밀번호를 잊어버렸을 때 <b>[비번 초기화]</b> 버튼으로 새로 설정</li>
                <li>팝업에 새 비밀번호를 입력하면 즉시 적용됨</li>
                <li>새 비밀번호를 해당 사용자에게 직접 전달</li>
                <li className="text-gray-500">기존 비밀번호는 복원할 수 없고 덮어쓰기만 가능함</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">5. 계정 삭제</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>더 이상 사용하지 않는 계정은 <b>[삭제]</b> 버튼으로 제거</li>
                <li>삭제 시 확인창이 뜨며, 확인 후에는 <b className="text-red-600">복구 불가</b></li>
                <li>본인 계정은 삭제할 수 없음 <span className="text-gray-400">(관리자가 사라지는 사고 방지)</span></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1.5">6. 최근 접속 확인</div>
              <ul className="list-disc pl-5 space-y-1 text-gray-600 leading-relaxed">
                <li>각 계정의 <b>최근 접속</b> 시간이 표시됨</li>
                <li>오랫동안 사용하지 않는 계정은 정리해서 보안 유지</li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <UserManager currentUserId={me!.id} />
    </main>
  );
}
