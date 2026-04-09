"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** 사용자 입력을 Supabase Auth용 이메일로 변환
   *  - "admin"      → "admin@kepco.local"
   *  - "name@x.com" → 그대로
   */
  const toEmail = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.includes("@")) return trimmed;
    return `${trimmed}@kepco.local`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: toEmail(loginId),
        password,
      });

      if (error) {
        // 사용자 친화적 메시지
        if (error.message.toLowerCase().includes("invalid")) {
          setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        } else if (error.message.toLowerCase().includes("email")) {
          setError("이메일 형식이 올바르지 않습니다.");
        } else {
          setError(error.message);
        }
        return;
      }

      // 로그인 성공 → 리다이렉트
      router.push(redirect);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-md border border-gray-200 p-6 space-y-4"
    >
      <div>
        <label htmlFor="loginId" className="block text-xs font-medium text-gray-700 mb-1.5">
          아이디
        </label>
        <input
          id="loginId"
          type="text"
          autoComplete="username"
          required
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          disabled={pending}
          className="w-full px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
          placeholder="admin"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1.5">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          className="w-full px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !loginId || !password}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-sm font-medium py-2.5 rounded-md transition-colors"
      >
        {pending ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
