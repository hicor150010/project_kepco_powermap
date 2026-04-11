import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "로그인",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg">
            <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
              <path d="M55 5 L30 50 L42 50 L38 95 L72 42 L58 42 Z" fill="white" opacity="0.95" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">PowerMap</h1>
          <p className="text-xs text-gray-500 mt-1">배전선로 여유용량 지도</p>
        </div>
        <Suspense fallback={<div className="h-48" />}>
          <LoginForm />
        </Suspense>
        <p className="text-[11px] text-gray-400 text-center mt-6">
          계정은 관리자에게 발급받으세요. 회원가입은 제공되지 않습니다.
        </p>
        <p className="text-[10px] text-gray-300 text-center mt-8">
          &copy; {new Date().getFullYear()} PowerMap. All rights reserved.
        </p>
      </div>
    </div>
  );
}
