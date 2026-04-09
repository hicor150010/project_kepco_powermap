"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleLogout}
      disabled={pending}
      className="w-full text-xs text-gray-600 hover:text-gray-900 border border-gray-300 hover:bg-gray-50 py-2 rounded-md disabled:opacity-50"
    >
      {pending ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
