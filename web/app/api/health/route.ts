/**
 * Supabase 연결 헬스체크
 * GET /api/health → { ok: true, project: "..." }
 * Phase 3 이후엔 제거 예정
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    // 가장 안전한 호출: auth.users 카운트 (admin 권한 필요)
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      userCount: data.users.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
