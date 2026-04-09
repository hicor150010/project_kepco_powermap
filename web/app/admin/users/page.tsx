import { getCurrentUser } from "@/lib/auth";
import UserManager from "@/components/admin/UserManager";

export const metadata = { title: "계정 관리 — 관리자" };

export default async function UsersPage() {
  const me = await getCurrentUser();
  // layout에서 이미 인증/권한 체크됨, 본인 ID만 전달
  return (
    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">계정 관리</h2>
        <p className="text-xs text-gray-500 mt-1">
          사용자 계정을 발급하고 권한을 관리합니다. 회원가입은 제공되지 않으니
          여기서 직접 발급해주세요.
        </p>
      </div>

      <UserManager currentUserId={me!.id} />
    </main>
  );
}
