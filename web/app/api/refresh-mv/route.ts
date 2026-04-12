/**
 * POST /api/refresh-mv
 * Materialized View 수동 새로고침 — 새로고침 버튼에서 호출
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("refresh_kepco_summary");

  if (error) {
    console.error("[refresh-mv] 실패:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
