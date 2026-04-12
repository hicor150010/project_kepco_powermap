/**
 * GET /api/compare/dates
 * history 테이블에 기록된 변경 날짜 목록 반환 (날짜 선택 UI용)
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kepco_capa_history")
    .select("changed_at")
    .order("changed_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  // 고유 날짜만 추출
  const dates = [...new Set((data ?? []).map((r: any) => r.changed_at))];

  return NextResponse.json({ ok: true, dates });
}
