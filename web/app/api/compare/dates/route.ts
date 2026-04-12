/**
 * GET /api/compare/dates
 * ref 기준일 + changelog에 기록된 날짜 목록 반환 (UI용)
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

  // ref 기준일
  const { data: refInfo } = await supabase.rpc("get_ref_info");
  const snapshotDate = refInfo?.[0]?.snapshot_date ?? null;

  // changelog에 기록된 날짜 목록
  const { data: dates, error } = await supabase
    .from("kepco_capa_changelog")
    .select("changed_date")
    .order("changed_date", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const uniqueDates = [...new Set((dates ?? []).map((r: any) => r.changed_date))];

  return NextResponse.json({
    ok: true,
    snapshotDate,
    dates: uniqueDates,
  });
}
