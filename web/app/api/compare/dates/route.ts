/**
 * GET /api/compare/dates
 * ref 기준일 정보 반환 (UI 표시용)
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
  const { data, error } = await supabase.rpc("get_ref_info");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const info = data?.[0] ?? { snapshot_date: null, total_count: 0 };

  return NextResponse.json({
    ok: true,
    snapshotDate: info.snapshot_date,
    totalCount: info.total_count,
  });
}
