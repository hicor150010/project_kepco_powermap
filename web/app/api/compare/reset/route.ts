/**
 * POST /api/compare/reset
 * 관리자 전용 — ref 기준 스냅샷 리셋
 * 현재 상태를 새 기준으로 저장
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "관리자만 리셋 가능합니다." },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("reset_capa_ref");

  if (error) {
    console.error("[compare/reset] RPC 실패:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, message: "기준 스냅샷이 리셋되었습니다." });
}
