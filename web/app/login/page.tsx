import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "로그인 — KEPCO 배전선로 여유용량 지도",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-gray-900">
            배전선로 여유용량 지도
          </h1>
          <p className="text-xs text-gray-500 mt-1">KEPCO 데이터 시각화</p>
        </div>
        <Suspense fallback={<div className="h-48" />}>
          <LoginForm />
        </Suspense>
        <p className="text-[11px] text-gray-400 text-center mt-6">
          계정은 관리자에게 발급받으세요. 회원가입은 제공되지 않습니다.
        </p>
      </div>
    </div>
  );
}
